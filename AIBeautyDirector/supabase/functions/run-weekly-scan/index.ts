// Deno entry for run-weekly-scan. Logic and tests live in handler.ts; this file wires Supabase (service role)
// behind the ScanDb interface and the provider adapters. Returns error codes only, never sentences.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createDermiq, dermiqEnvFrom } from '../_shared/adapters/dermiq.ts';
import { createLlm, llmEnvFrom } from '../_shared/adapters/llm.ts';
import { ScanError } from '../_shared/codes.ts';
import type { ScanDb } from '../_shared/scan-db.ts';
import { handleWeeklyScan } from './handler.ts';

const BUCKET = 'scan-images';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Any query error becomes db_failed; the handler never sees Postgres messages.
const must = <T>(res: { data: T; error: { code?: string; message?: string } | null }, what: string): T => {
  if (res.error) {
    console.error(`run-weekly-scan: ${what} ${res.error.code ?? ''}`);
    throw new ScanError('db_failed', 500, what);
  }
  return res.data;
};

// deno-lint-ignore no-explicit-any
function supabaseScanDb(admin: any): ScanDb {
  return {
    async hasPhotoConsent(userId) {
      const row = must(await admin.from('current_consents').select('granted').eq('user_id', userId).eq('purpose', 'photo_analysis').maybeSingle(), 'consent');
      return row?.granted === true;
    },
    async sweepStale(userId, before) {
      const rows = must(
        await admin.from('scans').update({ status: 'failed', failure_code: 'stale' }).eq('user_id', userId).in('status', ['pending', 'processing']).lt('created_at', before).select('image_path'),
        'sweep',
      ) as { image_path: string | null }[];
      return rows.map((r) => r.image_path).filter((p): p is string => !!p);
    },
    async lastSucceededAt(userId) {
      const row = must(
        await admin.from('scans').select('completed_at').eq('user_id', userId).eq('status', 'succeeded').order('completed_at', { ascending: false }).limit(1).maybeSingle(),
        'last_succeeded',
      );
      return row?.completed_at ?? null;
    },
    async insertPending(row) {
      const res = await admin.from('scans').insert(row).select('id').single();
      if (res.error?.code === '23505') return 'in_progress'; // scans_one_in_flight
      return { id: must(res, 'insert_scan').id as string };
    },
    async markProcessing(scanId, patch) {
      must(await admin.from('scans').update({ status: 'processing', ...patch }).eq('id', scanId), 'mark_processing');
    },
    async insertMetrics(scanId, userId, metrics) {
      must(await admin.from('scan_metrics').insert(metrics.map((m) => ({ ...m, scan_id: scanId, user_id: userId }))), 'insert_metrics');
    },
    async deleteMetrics(scanId) {
      must(await admin.from('scan_metrics').delete().eq('scan_id', scanId), 'delete_metrics');
    },
    async loadContext(userId) {
      const [profile, settings, reactions, products, routines, prevScan] = await Promise.all([
        admin.from('skin_profiles').select('goals, budget').eq('user_id', userId).maybeSingle(),
        admin.from('user_settings').select('persona, locale').eq('user_id', userId).maybeSingle(),
        admin.from('product_reactions').select('ingredient, severity').eq('user_id', userId).is('resolved_at', null),
        admin.from('user_products').select('category').eq('user_id', userId).eq('status', 'active'),
        admin.from('routines').select('period, routine_steps(step_type)').eq('user_id', userId).eq('is_active', true),
        admin.from('scans').select('id, provider, provider_model_version, capture_protocol_version, scan_metrics(metric_code, value, metric_definition_version)').eq('user_id', userId).eq('status', 'succeeded').order('completed_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      const p = must(profile, 'skin_profile');
      const s = must(settings, 'settings');
      const steps = { am: [] as string[], pm: [] as string[] };
      for (const r of must(routines, 'routines') as { period: 'am' | 'pm'; routine_steps: { step_type: string }[] }[]) {
        steps[r.period].push(...r.routine_steps.map((x) => x.step_type));
      }
      const prev = must(prevScan, 'previous_scan') as {
        provider: string; provider_model_version: string | null; capture_protocol_version: string;
        scan_metrics: { metric_code: string; value: number; metric_definition_version: string }[];
      } | null;
      const metrics = prev?.scan_metrics ?? [];
      return {
        goals: p?.goals ?? [],
        budget: p?.budget ?? null,
        reactions: must(reactions, 'reactions'),
        ownedCategories: (must(products, 'products') as { category: string }[]).map((x) => x.category),
        routineSteps: steps,
        persona: s?.persona ?? 'gentle',
        locale: s?.locale ?? 'zh-TW',
        previous: prev
          ? {
              provider: prev.provider,
              provider_model_version: prev.provider_model_version,
              capture_protocol_version: prev.capture_protocol_version,
              metric_definition_version: metrics[0]?.metric_definition_version ?? '',
              metrics: metrics.map((m) => ({ ...m, value: Number(m.value) })),
            }
          : null,
      } as Awaited<ReturnType<ScanDb['loadContext']>>;
    },
    async insertReview(scanId, userId, message) {
      const thread = must(await admin.from('chat_threads').insert({ user_id: userId, origin: 'weekly_scan', scan_id: scanId }).select('id').single(), 'insert_thread');
      must(
        await admin.from('chat_messages').insert({
          user_id: userId,
          thread_id: thread.id,
          role: 'assistant',
          content: message.content,
          model: message.model,
          prompt_tokens: message.promptTokens,
          completion_tokens: message.completionTokens,
        }),
        'insert_message',
      );
      return { threadId: thread.id as string };
    },
    async markSucceeded(scanId) {
      must(await admin.from('scans').update({ status: 'succeeded', completed_at: new Date().toISOString() }).eq('id', scanId), 'mark_succeeded');
    },
    async markFailed(scanId, code) {
      must(await admin.from('scans').update({ status: 'failed', failure_code: code }).eq('id', scanId), 'mark_failed');
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const env = (k: string) => Deno.env.get(k);
  const admin = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let dermiq, llm;
  try {
    dermiq = createDermiq(dermiqEnvFrom(env));
    llm = createLlm(llmEnvFrom(env));
  } catch (e) {
    console.error('run-weekly-scan: provider not configured');
    return json(500, { error: e instanceof ScanError ? e.code : 'provider_failed' });
  }

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? null;
  const body = await req.json().catch(() => null);
  const photos = admin.storage.from(BUCKET);
  const res = await handleWeeklyScan({ jwt, body }, {
    getUser: async (token) => {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    downloadPhoto: async (path) => {
      const { data, error } = await photos.download(path);
      return error ? null : data;
    },
    deletePhoto: async (path) => {
      const { error } = await photos.remove([path]);
      if (error) throw error;
    },
    db: supabaseScanDb(admin),
    dermiq,
    llm,
  });
  return json(res.status, res.body);
});
