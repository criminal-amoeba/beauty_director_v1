// Daily job (pg_cron + pg_net, migration …31000006): removes scan uploads older than 24 h through the Storage
// API (a SQL delete would leave the file behind). Not user-callable: verify_jwt is off and the caller must send
// the PURGE_UPLOADS_SECRET shared with the cron job (Vault). Logs counts only, never paths (they hold user ids).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { stalePaths, type StoredFile } from './stale.ts';

const BUCKET = 'scan-images';
const PAGE = 1000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const secret = Deno.env.get('PURGE_UPLOADS_SECRET');
  if (!secret || req.headers.get('x-purge-secret') !== secret) return json(401, { error: 'unauthorized' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const photos = admin.storage.from(BUCKET);
  const list = async (prefix: string) => {
    const all: StoredFile[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await photos.list(prefix, { limit: PAGE, offset });
      if (error) throw error;
      all.push(...data);
      if (data.length < PAGE) return all;
    }
  };

  try {
    const now = Date.now();
    const folders = (await list('')).filter((f) => f.id === null);
    let removed = 0;
    for (const folder of folders) {
      const paths = stalePaths(folder.name, await list(folder.name), now);
      if (!paths.length) continue;
      const { error } = await photos.remove(paths);
      if (error) throw error;
      removed += paths.length;
    }
    console.log(`purge-uploads: folders=${folders.length} removed=${removed}`);
    return json(200, { removed });
  } catch (e) {
    console.error('purge-uploads: failed', e instanceof Error ? e.name : 'unknown');
    return json(500, { error: 'storage_failed' });
  }
});
