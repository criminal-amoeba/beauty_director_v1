import { useEffect, useState } from 'react';

// Current time, re-rendering every `intervalMs` (1 s for countdowns, a minute for "today" and the hour).
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
