// Deletes the caller's account: scan photos first, sub-folders too (storage has no FK to auth.users), then the auth user.
// Every public table cascades from auth.users. Returns error codes, never sentences.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { listFiles, type Entry } from './paths.ts';

const BUCKET = 'scan-images'; // path convention: {user_id}/{file}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!jwt) return json(401, { error: 'unauthorized' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // verify_jwt also lets the anon key through, so the caller must resolve to a real user.
  const { data: { user }, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !user) return json(401, { error: 'unauthorized' });

  const photos = admin.storage.from(BUCKET);
  const PAGE = 1000;
  try {
    const paths = await listFiles(async (prefix) => {
      const all: Entry[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await photos.list(prefix, { limit: PAGE, offset });
        if (error) throw error;
        all.push(...data);
        if (data.length < PAGE) return all;
      }
    }, user.id);
    for (let i = 0; i < paths.length; i += PAGE) {
      const { error } = await photos.remove(paths.slice(i, i + PAGE));
      if (error) throw error;
    }
  } catch (e) {
    console.error('delete-account: photos not removed', e instanceof Error ? e.name : 'unknown');
    return json(500, { error: 'storage_failed' });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('delete-account: delete user failed', deleteError.code ?? deleteError.name);
    return json(500, { error: 'delete_failed' });
  }
  return json(200, { deleted: true });
});
