import { countdownParts, scanDue } from '../due';

const DAY = 24 * 60 * 60 * 1000;
const last = '2026-10-23T02:00:00Z';
const lastMs = Date.parse(last);

describe('scanDue', () => {
  it('is due when there is no succeeded scan yet', () => {
    expect(scanDue(null, Date.now())).toEqual({ due: true, msLeft: 0, daysSince: null });
  });

  it('is not due one minute before 7 days', () => {
    const r = scanDue(last, lastMs + 7 * DAY - 60_000);
    expect(r).toEqual({ due: false, msLeft: 60_000, daysSince: 6 });
  });

  it('is due at exactly 7 days and after', () => {
    expect(scanDue(last, lastMs + 7 * DAY)).toEqual({ due: true, msLeft: 0, daysSince: 7 });
    expect(scanDue(last, lastMs + 30 * DAY)).toEqual({ due: true, msLeft: 0, daysSince: 7 });
  });

  it('counts whole days since the scan', () => {
    expect(scanDue(last, lastMs + 2.5 * DAY).daysSince).toBe(2);
    expect(scanDue(last, lastMs + 1000).daysSince).toBe(0);
  });
});

describe('countdownParts', () => {
  it('shows days and hours while a day or more is left', () => {
    expect(countdownParts(3 * DAY + 4 * 3_600_000 + 5 * 60_000)).toEqual({ days: 3, hours: 4 });
    expect(countdownParts(DAY)).toEqual({ days: 1, hours: 0 });
  });

  it('shows hours and minutes on the last day, rounding minutes up', () => {
    expect(countdownParts(5 * 3_600_000 + 12 * 60_000)).toEqual({ hours: 5, minutes: 12 });
    expect(countdownParts(30_000)).toEqual({ hours: 0, minutes: 1 });
    expect(countdownParts(DAY - 1)).toEqual({ days: 1, hours: 0 });
  });
});
