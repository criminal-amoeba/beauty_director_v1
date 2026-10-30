import { addDays } from './dates';

export const GRACE_WINDOW = 7;

export type Streak = { days: number; welcomeBack: boolean };

// Recovery streak. An active day = AM or PM done that local day. Counting back from today
// (from yesterday while today is still open), one missed day per 7 is forgiven; a second miss within 7 days,
// or two in a row, ends the streak. Forgiven days don't count. Never shames: welcomeBack after a missed yesterday.
export function computeStreak(activeDates: Iterable<string>, today: string): Streak {
  const active = new Set(activeDates);
  if (active.size === 0) return { days: 0, welcomeBack: false };
  const earliest = [...active].sort()[0];

  let cursor = active.has(today) ? today : addDays(today, -1);
  let days = 0;
  let lastGrace: string | null = null;
  while (cursor >= earliest) {
    if (active.has(cursor)) {
      days++;
    } else if (lastGrace === null || addDays(cursor, GRACE_WINDOW) <= lastGrace) {
      lastGrace = cursor;
    } else {
      break;
    }
    cursor = addDays(cursor, -1);
  }
  const yesterday = addDays(today, -1);
  return { days, welcomeBack: !active.has(yesterday) && earliest < today };
}
