// Calendar days in the user's time zone as 'YYYY-MM-DD'. Never toISOString() for "today": that's the UTC day,
// which in Taipei (UTC+8) is still yesterday until 08:00.
export const DEFAULT_TZ = 'Asia/Taipei';

const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(now: number, tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    });
    formatters.set(tz, f);
  }
  const get = (type: Intl.DateTimeFormatPartTypes) => f.formatToParts(now).find((p) => p.type === type)!.value;
  return { year: get('year'), month: get('month'), day: get('day'), hour: Number(get('hour')) };
}

export const localDate = (now: number, tz: string) => {
  const p = parts(now, tz);
  return `${p.year}-${p.month}-${p.day}`;
};

export const localHour = (now: number, tz: string) => parts(now, tz).hour;

const pad = (n: number) => String(n).padStart(2, '0');

// Pure calendar arithmetic on a date string (UTC fields only, so no time zone can shift it).
export function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// The routine day runs 02:00 → 01:59 local: an evening routine done at 01:30 still counts for the evening before.
// The AM card is highlighted 02:00–11:59, PM 12:00–01:59 (a highlight only: either routine can be done any time).
// Per-user times (user_settings) are planned with Settings in step 10.
export const DAY_START_HOUR = 2;
export const AM_UNTIL_HOUR = 12;

// The day a routine done at `now` belongs to. Stored as routine_completions.local_date.
export const routineDate = (now: number, tz: string) =>
  localHour(now, tz) < DAY_START_HOUR ? addDays(localDate(now, tz), -1) : localDate(now, tz);

export const periodNow = (hour: number): 'am' | 'pm' => (hour >= DAY_START_HOUR && hour < AM_UNTIL_HOUR ? 'am' : 'pm');
