// Consecutive messages of one role sent within five minutes form a visual group: avatar + name on the first,
// timestamp on the last, tighter spacing in between.
export const GROUP_GAP_MS = 5 * 60_000;

export function groupFlags(messages: { role: string; created_at: string }[]): { first: boolean; last: boolean }[] {
  const together = (a: { role: string; created_at: string }, b: { role: string; created_at: string }) =>
    a.role === b.role && Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) <= GROUP_GAP_MS;
  return messages.map((m, i) => ({
    first: i === 0 || !together(messages[i - 1], m),
    last: i === messages.length - 1 || !together(m, messages[i + 1]),
  }));
}
