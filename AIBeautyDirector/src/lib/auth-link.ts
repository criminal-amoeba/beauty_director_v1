export type AuthCallback = { type: 'code'; authCode: string } | { type: 'error'; code: string };

const params = (s: string) =>
  Object.fromEntries(
    s.split('&').filter(Boolean).map((kv) => {
      const [k, v = ''] = kv.split('=');
      return [decodeURIComponent(k), decodeURIComponent(v.replace(/\+/g, ' '))];
    }),
  ) as Record<string, string>;

// Supabase's confirmation, password-reset and OAuth (LINE) redirects (PKCE flow): a one-time code in the query,
// or an error in the query or fragment. Fragment tokens (implicit flow) are ignored on purpose: anyone can craft
// such a link, while a code only works with the verifier this device stored when it started the flow.
// Manual parsing: React Native's URL/URLSearchParams are incomplete.
export function parseAuthCallback(url: string | null | undefined): AuthCallback | null {
  if (!url) return null;
  const [beforeHash, hash = ''] = url.split('#');
  const all = { ...params(beforeHash.split('?')[1] ?? ''), ...params(hash) };
  if (all.error_code || all.error) return { type: 'error', code: all.error_code || all.error };
  if (all.code) return { type: 'code', authCode: all.code };
  return null;
}

export const RESEND_COOLDOWN_S = 120;

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export const resendWaitSeconds = (sentAt: number, now: number, cooldown = RESEND_COOLDOWN_S) =>
  Math.max(0, Math.ceil((sentAt + cooldown * 1000 - now) / 1000));
