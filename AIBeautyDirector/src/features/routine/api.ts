import { supabase } from '@/lib/supabase';
import { readJson, writeJson } from '@/lib/storage';
import { CATEGORIES, GOALS, LEVELS, isOneOf } from '@/features/onboarding/codes';
import type { CompletionRow } from './completion';
import { DEFAULT_TZ, addDays, localDate } from './dates';
import { STEP_TYPES, buildDefaultSteps, type Period, type StepType } from './steps';

// postgrest-js reports a failed fetch as status 0. Screens show the offline state for those.
export class DataError extends Error {
  constructor(readonly offline: boolean, readonly code?: string) {
    super(code ?? (offline ? 'offline' : 'failed'));
  }
}
export const isOffline = (e: unknown) => e instanceof DataError && e.offline;

type Res<T> = { data: T; error: { code: string } | null; status: number };
function check<T>(res: Res<T>): T {
  if (res.error) throw new DataError(res.status === 0, res.error.code);
  return res.data;
}
const UNIQUE_VIOLATION = '23505';

export type RoutineStep = { id: string; position: number; stepType: StepType; name: string | null; product: string | null };
export type Routine = { id: string; period: Period; steps: RoutineStep[] };
export type Completion = Pick<CompletionRow, 'period' | 'local_date' | 'completed_step_ids' | 'skipped_step_ids'>;
export type HomeData = {
  name: string | null;
  tz: string;
  routines: Record<Period, Routine>;
  completions: Completion[]; // newest first, includes completions still queued on this device
  lastScanAt: string | null; // completed_at of the latest succeeded scan
};

async function selectRoutine(userId: string, period: Period): Promise<Routine | null> {
  const row = check(await supabase
    .from('routines')
    .select('id, routine_steps(id, position, step_type, name, user_products(name, brand))')
    .eq('user_id', userId)
    .eq('period', period)
    .eq('is_active', true)
    .order('position', { referencedTable: 'routine_steps' })
    .maybeSingle());
  if (!row) return null;
  return {
    id: row.id,
    period,
    steps: row.routine_steps.flatMap((s) => isOneOf(STEP_TYPES, s.step_type)
      ? [{
          id: s.id,
          position: s.position,
          stepType: s.step_type,
          name: s.name,
          product: s.user_products ? [s.user_products.brand, s.user_products.name].filter(Boolean).join(' ') : null,
        }]
      : []),
  };
}

// The user's active routine for a period, created from onboarding answers the first time.
// The DB allows one active routine per period and one step per position, so a second tap or device that
// races this gets 23505 and simply reads what the first one created (the old code added a routine per visit).
export async function ensureRoutine(userId: string, period: Period): Promise<Routine> {
  let routine = await selectRoutine(userId, period);
  if (!routine) {
    const res = await supabase.from('routines').insert({ period, version: 1, source: 'system' });
    if (res.error?.code !== UNIQUE_VIOLATION) check(res);
    routine = await selectRoutine(userId, period);
    if (!routine) throw new DataError(false, 'routine_missing');
  }
  if (routine.steps.length > 0) return routine;

  const [skin, products] = await Promise.all([
    supabase.from('skin_profiles').select('goals, routine_level').eq('user_id', userId).maybeSingle(),
    supabase.from('user_products').select('id, category').eq('user_id', userId).eq('status', 'active').order('created_at'),
  ]);
  const s = check(skin);
  const owned = (check(products) ?? []).flatMap((p) => (isOneOf(CATEGORIES, p.category) ? [{ id: p.id, category: p.category }] : []));
  const drafts = buildDefaultSteps(period, {
    goals: (s?.goals ?? []).filter((g) => isOneOf(GOALS, g)),
    level: isOneOf(LEVELS, s?.routine_level) ? s.routine_level : null,
  }, owned);
  const existing = routine;
  const res = await supabase.from('routine_steps').insert(drafts.map((d) => ({ ...d, routine_id: existing.id })));
  if (res.error?.code !== UNIQUE_VIOLATION) check(res);
  return (await selectRoutine(userId, period)) ?? existing;
}

export async function loadHome(userId: string, now = Date.now()): Promise<HomeData> {
  // shortcut: one year of completions bounds the streak at ~365 days; page further back if streaks get that long.
  const since = addDays(localDate(now, 'UTC'), -367);
  const [profile, settings, completions, scan, am, pm, queued] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('user_id', userId).maybeSingle(),
    supabase.from('user_settings').select('timezone').eq('user_id', userId).maybeSingle(),
    supabase.from('routine_completions')
      .select('period, local_date, completed_step_ids, skipped_step_ids')
      .eq('user_id', userId)
      .gte('local_date', since)
      .order('local_date', { ascending: false }),
    supabase.from('scans')
      .select('completed_at')
      .eq('user_id', userId)
      .eq('status', 'succeeded')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    ensureRoutine(userId, 'am'),
    ensureRoutine(userId, 'pm'),
    readQueue(userId),
  ]);
  const saved = (check(completions) ?? []).flatMap((c) => (isOneOf(['am', 'pm'] as const, c.period) ? [{ ...c, period: c.period }] : []));
  return {
    name: check(profile)?.display_name ?? null,
    tz: check(settings)?.timezone ?? DEFAULT_TZ,
    routines: { am, pm },
    completions: mergeCompletions(saved, queued),
    lastScanAt: check(scan)?.completed_at ?? null,
  };
}

const sameSlot = (a: Completion, b: Completion) => a.period === b.period && a.local_date === b.local_date;
export const mergeCompletions = (saved: Completion[], extra: Completion[]) =>
  [...saved, ...extra.filter((q) => !saved.some((s) => sameSlot(s, q)))].sort((a, b) => (a.local_date < b.local_date ? 1 : a.local_date > b.local_date ? -1 : 0));

// 'saved' also covers a duplicate (23505): the unique (user, period, day) key makes resubmits and queue replays safe.
export async function submitCompletion(row: CompletionRow): Promise<'saved' | 'queued'> {
  const res = await supabase.from('routine_completions').insert(row);
  if (!res.error || res.error.code === UNIQUE_VIOLATION) return 'saved';
  if (res.status === 0) {
    await enqueue(row);
    return 'queued';
  }
  throw new DataError(false, res.error.code);
}

// Offline queue on the device. Entries carry user_id: only the signed-in user's entries are sent,
// and RLS rejects a row whose user_id isn't the caller.
const QUEUE_KEY = 'completion_queue';
const readAll = async () => (await readJson<CompletionRow[]>(QUEUE_KEY)) ?? [];

export const readQueue = async (userId: string) => (await readAll()).filter((r) => r.user_id === userId);

async function enqueue(row: CompletionRow) {
  const all = await readAll();
  await writeJson(QUEUE_KEY, [...all.filter((r) => !(r.user_id === row.user_id && sameSlot(r, row))), row]);
}

// Sends this user's queued completions. Kept only while offline; a server rejection drops the entry
// (a retry would fail the same way). Returns how many left the queue.
export async function flushQueue(userId: string): Promise<number> {
  const all = await readAll();
  const mine = all.filter((r) => r.user_id === userId);
  if (mine.length === 0) return 0;
  const keep: CompletionRow[] = all.filter((r) => r.user_id !== userId);
  for (const row of mine) {
    const res = await supabase.from('routine_completions').insert(row);
    if (res.error && res.status === 0) keep.push(row);
    else if (res.error && res.error.code !== UNIQUE_VIOLATION && __DEV__) console.warn('[routine] queued completion dropped:', res.error.code);
  }
  await writeJson(QUEUE_KEY, keep);
  return all.length - keep.length;
}
