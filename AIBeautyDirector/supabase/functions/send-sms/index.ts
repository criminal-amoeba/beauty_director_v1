// Supabase Auth "Send SMS" hook → Labspace. Supabase generates, rate-limits and verifies the OTP; this only delivers it.
// Deployed with verify_jwt = false: the Standard Webhooks signature is the authentication.
// Never log the phone number or the code.
import { verifyWebhook } from '../_shared/webhook.ts';
import { labspaceNumber, labspaceOutcome, smsBody, smsLocale } from './sms.ts';

const LABSPACE_URL = 'https://sms-api.labspace.com.tw/api/v2/send';
const TIMEOUT_MS = 4500; // Supabase gives HTTP hooks 5 s

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// Supabase hook error format; the app maps failures to "couldn't send code".
const hookError = (httpCode: number, message: string) => json(httpCode, { error: { http_code: httpCode, message } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return hookError(405, 'method_not_allowed');
  const secret = Deno.env.get('SEND_SMS_HOOK_SECRET');
  const apiKey = Deno.env.get('LABSPACE_SMS_API_KEY');
  if (!secret || !apiKey) {
    console.error('send-sms: secrets not configured');
    return hookError(500, 'not_configured');
  }

  const body = await req.text();
  if (!(await verifyWebhook(secret, req.headers, body))) return hookError(401, 'invalid_signature');

  let payload: { user?: { phone?: unknown; user_metadata?: { locale?: unknown } }; sms?: { otp?: unknown } };
  try {
    payload = JSON.parse(body);
  } catch {
    return hookError(400, 'invalid_payload');
  }
  const phone = payload.user?.phone;
  const otp = payload.sms?.otp;
  if (typeof phone !== 'string' || !phone || typeof otp !== 'string' || !otp) return hookError(400, 'invalid_payload');

  let res: Response;
  try {
    res = await fetch(LABSPACE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dstaddr: labspaceNumber(phone),
        smbody: smsBody(smsLocale(payload.user?.user_metadata?.locale), otp),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    console.error('send-sms: labspace unreachable');
    return hookError(502, 'sms_send_failed');
  }

  const reply = await res.json().catch(() => null);
  const outcome = labspaceOutcome(res.status, reply);
  if (!outcome.ok) {
    console.error(`send-sms: labspace ${outcome.code}`);
    return hookError(outcome.code === 'RATE_LIMITED' ? 429 : 502, 'sms_send_failed');
  }
  // Field names only (values hold the phone number): documents the real reply shape.
  console.log(`send-sms: sent${outcome.duplicate ? ' (duplicate, earlier code still valid)' : ''}; data keys: ${Object.keys(reply?.data ?? {}).join(',')}`);
  return json(200, {});
});
