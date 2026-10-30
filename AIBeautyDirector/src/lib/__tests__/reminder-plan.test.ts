import { planReminders, type ReminderSettings } from '../reminder-plan';

const off: ReminderSettings = {
  am_reminder_enabled: false, am_reminder_time: '08:00',
  pm_reminder_enabled: false, pm_reminder_time: '21:30',
  scan_reminder_enabled: false,
};
// Local-time helpers so the tests pass in any TZ.
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const now = local(2026, 11, 1, 12);

describe('planReminders', () => {
  it('plans nothing when everything is off', () => {
    expect(planReminders(off, iso(now), now)).toEqual([]);
  });

  it('plans daily AM and PM at the saved times', () => {
    const s = { ...off, am_reminder_enabled: true, am_reminder_time: '07:45', pm_reminder_enabled: true };
    expect(planReminders(s, null, now)).toEqual([
      { kind: 'am', hour: 7, minute: 45 },
      { kind: 'pm', hour: 21, minute: 30 },
    ]);
  });

  it('skips the scan reminder before the first scan', () => {
    expect(planReminders({ ...off, scan_reminder_enabled: true }, null, now)).toEqual([]);
  });

  it('reminds at 09:00 on the day the scan opens when AM is off', () => {
    const last = local(2026, 11, 1, 7, 0); // opens Nov 8 07:00
    expect(planReminders({ ...off, scan_reminder_enabled: true }, iso(last), now)).toEqual([{ kind: 'scan', date: local(2026, 11, 8, 9, 0) }]);
  });

  it('uses the AM time and moves to the next day when the scan opens later', () => {
    const s = { ...off, scan_reminder_enabled: true, am_reminder_enabled: true, am_reminder_time: '08:30' };
    const last = local(2026, 11, 1, 20, 0); // opens Nov 8 20:00, after 08:30
    expect(planReminders(s, iso(last), now).find((r) => r.kind === 'scan')).toEqual({ kind: 'scan', date: local(2026, 11, 9, 8, 30) });
  });

  it('skips the scan reminder once the scan is already open', () => {
    const last = local(2026, 10, 20, 9, 0);
    expect(planReminders({ ...off, scan_reminder_enabled: true }, iso(last), now)).toEqual([]);
  });
});
