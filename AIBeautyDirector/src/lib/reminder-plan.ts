import { SCAN_INTERVAL_MS } from '@/features/scan/due';

// Pure: what the phone should schedule for the saved reminder settings (notifications.ts schedules it).
export type ReminderSettings = {
  am_reminder_enabled: boolean;
  am_reminder_time: string; // HH:mm, device local time
  pm_reminder_enabled: boolean;
  pm_reminder_time: string;
  scan_reminder_enabled: boolean;
};
export type ReminderKind = 'am' | 'pm' | 'scan';
export type PlannedReminder =
  | { kind: 'am' | 'pm'; hour: number; minute: number }
  | { kind: 'scan'; date: number };

const SCAN_DEFAULT_TIME = '09:00';
const hm = (time: string) => ({ hour: Number(time.slice(0, 2)), minute: Number(time.slice(3, 5)) });

// Scan: one reminder at the first AM-reminder time (or 09:00) on or after the moment the next scan opens.
// No reminder before the first scan or once the scan is already open (Home shows it), and it never repeats.
export function planReminders(s: ReminderSettings, lastScanAt: string | null, now: number): PlannedReminder[] {
  const plan: PlannedReminder[] = [];
  if (s.am_reminder_enabled) plan.push({ kind: 'am', ...hm(s.am_reminder_time) });
  if (s.pm_reminder_enabled) plan.push({ kind: 'pm', ...hm(s.pm_reminder_time) });
  if (s.scan_reminder_enabled && lastScanAt) {
    const due = Date.parse(lastScanAt) + SCAN_INTERVAL_MS;
    const { hour, minute } = hm(s.am_reminder_enabled ? s.am_reminder_time : SCAN_DEFAULT_TIME);
    const at = new Date(due);
    at.setHours(hour, minute, 0, 0);
    if (at.getTime() < due) at.setDate(at.getDate() + 1);
    if (at.getTime() > now) plan.push({ kind: 'scan', date: at.getTime() });
  }
  return plan;
}
