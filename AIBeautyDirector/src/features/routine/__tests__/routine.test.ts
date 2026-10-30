import { buildCompletion } from '../completion';
import { addDays, localDate, localHour, periodNow, routineDate } from '../dates';
import { STEP_TYPES, buildDefaultSteps } from '../steps';
import { computeStreak } from '../streak';
import { GOALS } from '@/features/onboarding/codes';
import en from '@/lib/i18n/en.json';
import zhTW from '@/lib/i18n/zh-TW.json';

const TPE = 'Asia/Taipei';
const at = (iso: string) => Date.parse(iso);
// Consecutive days ending at `end`, oldest first.
const run = (end: string, n: number) => Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));

describe('localDate in Asia/Taipei (UTC+8)', () => {
  it('rolls over at local midnight, which is 16:00 UTC', () => {
    expect(localDate(at('2026-10-29T15:59:59Z'), TPE)).toBe('2026-10-29');
    expect(localDate(at('2026-10-29T16:00:00Z'), TPE)).toBe('2026-10-30');
  });

  it('is already today before 08:00 local, while the UTC date is still yesterday (the old toISOString bug)', () => {
    expect(localDate(at('2026-10-29T23:59:00Z'), TPE)).toBe('2026-10-30'); // 07:59 local
    expect(localDate(at('2026-10-30T00:00:00Z'), TPE)).toBe('2026-10-30'); // 08:00 local
  });

  it('gives the local hour', () => {
    expect(localHour(at('2026-10-29T16:00:00Z'), TPE)).toBe(0);
    expect(localHour(at('2026-10-29T23:59:00Z'), TPE)).toBe(7);
    expect(localHour(at('2026-10-30T00:00:00Z'), TPE)).toBe(8);
  });
});

describe('addDays', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('routineDate in Asia/Taipei (day starts 02:00 local)', () => {
  it('keeps 00:00–01:59 local on the day before', () => {
    expect(routineDate(at('2026-10-29T15:59:59Z'), TPE)).toBe('2026-10-29'); // 23:59:59 on the 29th
    expect(routineDate(at('2026-10-29T16:00:00Z'), TPE)).toBe('2026-10-29'); // 00:00 on the 30th
    expect(routineDate(at('2026-10-29T17:59:59Z'), TPE)).toBe('2026-10-29'); // 01:59:59 on the 30th
  });

  it('starts the new day at 02:00 local, which is 18:00 UTC', () => {
    expect(routineDate(at('2026-10-29T18:00:00Z'), TPE)).toBe('2026-10-30');
  });

  it('is already today before 08:00 local, while the UTC date is still yesterday', () => {
    expect(routineDate(at('2026-10-29T23:59:00Z'), TPE)).toBe('2026-10-30'); // 07:59 local
    expect(routineDate(at('2026-10-30T00:00:00Z'), TPE)).toBe('2026-10-30'); // 08:00 local
  });

  it('crosses month ends', () => {
    expect(routineDate(at('2026-10-31T17:00:00Z'), TPE)).toBe('2026-10-31'); // 01:00 on Nov 1
  });
});

describe('periodNow', () => {
  it('highlights AM from 02:00 to 11:59, PM from 12:00 to 01:59', () => {
    expect([0, 1, 2, 11, 12, 23].map(periodNow)).toEqual(['pm', 'pm', 'am', 'am', 'pm', 'pm']);
  });
});

describe('computeStreak', () => {
  const today = '2026-10-30';

  it('is 0 with no history, without a welcome back', () => {
    expect(computeStreak([], today)).toEqual({ days: 0, welcomeBack: false });
  });

  it('counts today', () => {
    expect(computeStreak([today], today)).toEqual({ days: 1, welcomeBack: false });
  });

  it('keeps yesterday while today is still open', () => {
    expect(computeStreak(run('2026-10-29', 5), today)).toEqual({ days: 5, welcomeBack: false });
  });

  it('forgives one missed day in 7 and says welcome back', () => {
    // done up to the 28th, missed the 29th, today still open
    expect(computeStreak(run('2026-10-28', 4), today)).toEqual({ days: 4, welcomeBack: true });
    // missed the 26th inside a run
    const dates = [...run('2026-10-25', 3), ...run(today, 4)];
    expect(computeStreak(dates, today)).toEqual({ days: 7, welcomeBack: false });
  });

  it('ends at a second miss within 7 days', () => {
    // misses on the 27th and the 23rd (4 days apart)
    const dates = [...run('2026-10-22', 3), ...run('2026-10-26', 3), ...run(today, 3)];
    expect(computeStreak(dates, today).days).toBe(6);
  });

  it('forgives misses that are 8 days apart', () => {
    // misses on the 28th and the 20th
    const dates = [...run('2026-10-19', 2), ...run('2026-10-27', 7), ...run(today, 2)];
    expect(computeStreak(dates, today).days).toBe(11);
  });

  it('ends at two missed days in a row, then welcomes back', () => {
    expect(computeStreak(run('2026-10-27', 5), today)).toEqual({ days: 0, welcomeBack: true });
    expect(computeStreak(run('2026-10-26', 5), today)).toEqual({ days: 0, welcomeBack: true });
  });

  it('uses the Taipei routine day around 00:00, 02:00 and 08:00', () => {
    // Done on the 28th and 29th. Until 01:59 on the 30th, "today" is still the 29th: done today, no welcome back.
    expect(computeStreak(['2026-10-28', '2026-10-29'], routineDate(at('2026-10-29T16:30:00Z'), TPE))).toEqual({ days: 2, welcomeBack: false });
    // From 02:00 the 30th is open and not yet a miss.
    expect(computeStreak(['2026-10-28', '2026-10-29'], routineDate(at('2026-10-29T18:00:00Z'), TPE))).toEqual({ days: 2, welcomeBack: false });
    // Done at 07:30 local on the 30th: saved as the 30th, so it counts as today (UTC would say the 29th).
    const done = routineDate(at('2026-10-29T23:30:00Z'), TPE);
    expect(done).toBe('2026-10-30');
    expect(computeStreak(['2026-10-28', done], routineDate(at('2026-10-30T00:00:00Z'), TPE))).toEqual({ days: 2, welcomeBack: true });
  });
});

describe('buildDefaultSteps', () => {
  const none = { goals: [], level: null };

  it('builds a basic AM and PM routine with no goals', () => {
    expect(buildDefaultSteps('am', none, []).map((s) => s.step_type)).toEqual(['cleanse', 'moisturize', 'protect']);
    expect(buildDefaultSteps('pm', none, []).map((s) => s.step_type)).toEqual(['cleanse', 'moisturize']);
  });

  it('handles every stored goal code (lower-case, as saved by onboarding)', () => {
    for (const goal of GOALS) {
      const pm = buildDefaultSteps('pm', { goals: [goal], level: 'beginner' }, []);
      expect(pm.length).toBe(3);
    }
    expect(buildDefaultSteps('am', { goals: ['hydration'], level: null }, []).map((s) => s.step_type))
      .toEqual(['cleanse', 'serum', 'moisturize', 'protect']);
    expect(buildDefaultSteps('am', { goals: ['firmness'], level: null }, []).map((s) => s.step_type))
      .toEqual(['cleanse', 'moisturize', 'protect']);
  });

  it('adds at most one treat step, before a serum', () => {
    const pm = buildDefaultSteps('pm', { goals: ['hydration', 'anti_aging', 'texture'], level: null }, []);
    expect(pm.map((s) => s.step_type)).toEqual(['cleanse', 'treat', 'moisturize']);
  });

  it('adds a toner step past beginner level, with positions 1..n', () => {
    const am = buildDefaultSteps('am', { goals: [], level: 'intermediate' }, []);
    expect(am.map((s) => [s.position, s.step_type])).toEqual([[1, 'cleanse'], [2, 'tone'], [3, 'moisturize'], [4, 'protect']]);
  });

  it('links owned products by category', () => {
    const am = buildDefaultSteps('am', none, [
      { id: 'p-cream', category: 'moisturizer' },
      { id: 'p-spf', category: 'sunscreen' },
      { id: 'p-mask', category: 'mask' },
    ]);
    expect(am.map((s) => s.product_id)).toEqual([null, 'p-cream', 'p-spf']);
  });
});

describe('step type labels', () => {
  it('exist in en and zh-TW for every code the DB allows', () => {
    for (const code of STEP_TYPES) {
      expect({ code, en: !!en.codes.stepType[code], zh: !!zhTW.codes.stepType[code] }).toEqual({ code, en: true, zh: true });
    }
  });
});

describe('buildCompletion', () => {
  const base = {
    userId: 'u1',
    routine: { id: 'r1', stepIds: ['s1', 's2', 's3', 's4'] },
    period: 'am' as const,
    now: at('2026-10-29T23:30:00Z'), // 07:30 on the 30th in Taipei
    tz: TPE,
  };

  it('builds the row in step order with the local date and explicit user', () => {
    expect(buildCompletion({ ...base, ticked: ['s3', 's1'], skipped: ['s2'] })).toEqual({
      user_id: 'u1',
      routine_id: 'r1',
      period: 'am',
      local_date: '2026-10-30',
      completed_step_ids: ['s1', 's3'],
      skipped_step_ids: ['s2'],
    });
  });

  it('drops ids from other routines and never marks a step both ticked and skipped', () => {
    const row = buildCompletion({ ...base, ticked: ['s1', 'other'], skipped: ['s1', 's4', 'gone'] });
    expect(row?.completed_step_ids).toEqual(['s1']);
    expect(row?.skipped_step_ids).toEqual(['s4']);
  });

  it('saves an evening routine finished at 01:30 local on the evening before', () => {
    const row = buildCompletion({ ...base, period: 'pm', now: at('2026-10-30T17:30:00Z'), ticked: ['s1'], skipped: [] });
    expect(row?.local_date).toBe('2026-10-30'); // 01:30 on the 31st in Taipei
  });

  it('is null when nothing is ticked', () => {
    expect(buildCompletion({ ...base, ticked: [], skipped: ['s1', 's2'] })).toBeNull();
    expect(buildCompletion({ ...base, ticked: ['other'], skipped: [] })).toBeNull();
  });
});
