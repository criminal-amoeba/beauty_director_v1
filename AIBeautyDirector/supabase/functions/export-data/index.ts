// Deno entry for export-data: the caller's data as one JSON document (handler.ts). Service role reads, each
// filtered by the caller's user_id. Returns error codes only; logs row counts, never data.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildExport, makeRateLimiter, type ExportDb } from './handler.ts';

const PAGE = 1000; // PostgREST max rows per request
const allow = makeRateLimiter();

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
  if (!allow(user.id, Date.now())) return json(429, { error: 'rate_limited' });

  const db: ExportDb = {
    async rows(table, columns, userId) {
      const out: Record<string, unknown>[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin.from(table).select(columns).eq('user_id', userId).order('created_at').range(from, from + PAGE - 1);
        if (error) throw new Error(`${table} ${error.code ?? ''}`);
        out.push(...(data as Record<string, unknown>[]));
        if (data.length < PAGE) return out;
      }
    },
  };
  try {
    const providers = (user.identities ?? []).map((i) => i.provider);
    const doc = await buildExport(db, { id: user.id, email: user.email, phone: user.phone, created_at: user.created_at, providers }, new Date());
    console.log('export-data: ok', Object.entries(doc).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k}=${(v as unknown[]).length}`).join(' '));
    return json(200, doc);
  } catch (e) {
    console.error('export-data: read failed', e instanceof Error ? e.message : 'unknown');
    return json(500, { error: 'export_failed' });
  }
});
