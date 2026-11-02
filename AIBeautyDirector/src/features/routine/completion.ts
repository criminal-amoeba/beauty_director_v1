import { routineDate } from './dates';
import type { Period } from './steps';

export type CompletionRow = {
  user_id: string;
  routine_id: string;
  period: Period;
  local_date: string;
  completed_step_ids: string[];
  skipped_step_ids: string[];
};

type Input = {
  userId: string;
  routine: { id: string; stepIds: string[] };
  period: Period;
  ticked: Iterable<string>;
  skipped: Iterable<string>;
  now: number;
  tz: string;
};

// The routine_completions insert. Only this routine's steps, a ticked step is never also skipped,
// local_date is the user's routine day (starts 02:00 local, see dates.ts). user_id is explicit so a queued row can't be replayed as another user.
// Null when nothing is ticked: an all-skipped routine isn't a completion.
export function buildCompletion({ userId, routine, period, ticked, skipped, now, tz }: Input): CompletionRow | null {
  const own = new Set(routine.stepIds);
  const done = new Set([...ticked].filter((id) => own.has(id)));
  if (done.size === 0) return null;
  const order = (ids: Set<string>) => routine.stepIds.filter((id) => ids.has(id));
  return {
    user_id: userId,
    routine_id: routine.id,
    period,
    local_date: routineDate(now, tz),
    completed_step_ids: order(done),
    skipped_step_ids: order(new Set([...skipped].filter((id) => !done.has(id)))),
  };
}
