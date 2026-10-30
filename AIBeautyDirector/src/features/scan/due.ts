// Client countdown only (cosmetic): the 7-day rule is enforced in the run-weekly-scan Edge Function.
export const SCAN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export type ScanDue = { due: boolean; msLeft: number; daysSince: number | null };

// lastSucceededAt: completed_at of the latest succeeded scan (failed/pending scans never count).
export function scanDue(lastSucceededAt: string | null, now: number): ScanDue {
  if (!lastSucceededAt) return { due: true, msLeft: 0, daysSince: null };
  const since = now - Date.parse(lastSucceededAt);
  const msLeft = Math.max(0, SCAN_INTERVAL_MS - since);
  return { due: msLeft === 0, msLeft, daysSince: Math.min(7, Math.floor(since / (24 * 60 * 60 * 1000))) };
}

// Calm countdown: days + hours, then hours + minutes on the last day, never seconds.
// Minutes round up so "0 m" never shows while the scan isn't due yet.
export function countdownParts(msLeft: number): { days: number; hours: number } | { hours: number; minutes: number } {
  const minutesLeft = Math.ceil(msLeft / 60_000);
  const hours = Math.floor(minutesLeft / 60);
  if (hours >= 24) return { days: Math.floor(hours / 24), hours: hours % 24 };
  return { hours, minutes: minutesLeft % 60 };
}
