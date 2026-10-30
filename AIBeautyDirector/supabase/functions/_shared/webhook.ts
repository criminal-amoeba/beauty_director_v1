// Standard Webhooks signature check (https://www.standardwebhooks.com), as sent by Supabase Auth hooks.
// Plain WebCrypto, no imports: runs in Deno (Edge Functions) and Node (Jest).

const TOLERANCE_S = 5 * 60;

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// secret: as shown in the dashboard, 'v1,whsec_<base64>'. Signature header: space-separated 'v1,<base64>' entries.
export async function verifyWebhook(
  secret: string,
  headers: Headers,
  body: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatures = headers.get('webhook-signature');
  if (!secret || !id || !timestamp || !signatures) return false;
  if (!/^\d+$/.test(timestamp) || Math.abs(nowSec - Number(timestamp)) > TOLERANCE_S) return false; // replay window

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      fromBase64(secret.replace(/^v1,/, '').replace(/^whsec_/, '')),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signed = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
    for (const entry of signatures.split(' ')) {
      const [version, signature] = entry.split(',');
      // subtle.verify compares in constant time.
      if (version === 'v1' && signature && (await crypto.subtle.verify('HMAC', key, fromBase64(signature), signed))) return true;
    }
  } catch {
    return false; // malformed base64 in the secret or a signature
  }
  return false;
}
