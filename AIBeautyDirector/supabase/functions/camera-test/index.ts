// Deno entry for the dev-only Camera Test function. Logic and tests live in handler.ts.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createDermiq, dermiqEnvFrom } from '../_shared/adapters/dermiq.ts';
import { ScanError } from '../_shared/codes.ts';
import { handleCameraTest } from './handler.ts';

const BUCKET = 'scan-images';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const env = (k: string) => Deno.env.get(k);
  const admin = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let dermiq;
  try {
    dermiq = createDermiq(dermiqEnvFrom(env));
  } catch (e) {
    console.error('camera-test: dermiq not configured');
    return json(500, { error: e instanceof ScanError ? e.code : 'provider_failed' });
  }

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? null;
  const body = await req.json().catch(() => null);
  const photos = admin.storage.from(BUCKET);
  const res = await handleCameraTest({ jwt, body }, {
    enabled: env('CAMERA_TEST_ENABLED') === 'true',
    getUser: async (token) => {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    downloadPhoto: async (path) => {
      const { data, error } = await photos.download(path);
      return error ? null : data;
    },
    deletePhoto: async (path) => {
      const { error } = await photos.remove([path]);
      if (error) throw error;
    },
    dermiq,
    logRaw: env('CAMERA_TEST_LOG_RAW') === 'true',
  });
  return json(res.status, res.body);
});
