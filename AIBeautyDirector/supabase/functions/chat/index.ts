// Deno entry for chat. Logic and tests live in handler.ts; this file wires Supabase (service role) behind the
// ChatDb interface and the LLM adapter. Returns error codes only, never sentences. Never logs user text.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createLlm, llmEnvFrom } from '../_shared/adapters/llm.ts';
import { parseBlocks } from '../_shared/chat/blocks.ts';
import type { ApplyResult, ChatDb, StoredMessage } from '../_shared/chat-db.ts';
import { ScanError } from '../_shared/codes.ts';
import type { ContextData } from '../_shared/context/types.ts';
import type { ProposalState } from '../_shared/rules/proposal.ts';
import { handleChat } from './handler.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Any query error becomes db_failed; the handler never sees Postgres messages.
const must = <T>(res: { data: T; error: { code?: string; message?: string } | null }, what: string): T => {
  if (res.error) {
    console.error(`chat: ${what} ${res.error.code ?? ''}`);
    throw new ScanError('db_failed', 500, what);
  }
  return res.data;
};

const toMessage = (m: { id: string; role: string; content: string; blocks: unknown; created_at: string }): StoredMessage => ({
  id: m.id,
  role: m.role === 'user' ? 'user' : 'assistant',
  content: m.content,
  blocks: parseBlocks(m.blocks),
  created_at: m.created_at,
});

// deno-lint-ignore no-explicit-any
function supabaseChatDb(admin: any): ChatDb {
  return {
    async countUserMessagesSince(userId, since) {
      const res = await admin.from('chat_messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('role', 'user').gte('created_at', since);
      must(res, 'count_messages');
      return res.count ?? 0;
    },
    async findThread(userId, threadId) {
      return must(await admin.from('chat_threads').select('id, origin').eq('id', threadId).eq('user_id', userId).maybeSingle(), 'find_thread');
    },
    async latestChatThread(userId, since) {
      return must(
        await admin.from('chat_threads').select('id').eq('user_id', userId).eq('origin', 'chat').gte('last_message_at', since).order('last_message_at', { ascending: false }).limit(1).maybeSingle(),
        'latest_thread',
      );
    },
    async createThread(userId) {
      return must(await admin.from('chat_threads').insert({ user_id: userId, origin: 'chat' }).select('id').single(), 'create_thread');
    },
    async claimThread(threadId, until, nowIso) {
      const rows = must(
        await admin.from('chat_threads').update({ busy_until: until }).eq('id', threadId).or(`busy_until.is.null,busy_until.lt.${nowIso}`).select('id'),
        'claim_thread',
      ) as unknown[];
      return rows.length === 1;
    },
    async releaseThread(threadId) {
      must(await admin.from('chat_threads').update({ busy_until: null }).eq('id', threadId), 'release_thread');
    },
    async insertMessage(row) {
      return toMessage(must(await admin.from('chat_messages').insert(row).select('id, role, content, blocks, created_at').single(), 'insert_message'));
    },
    async touchThread(threadId, at) {
      must(await admin.from('chat_threads').update({ last_message_at: at }).eq('id', threadId), 'touch_thread');
    },
    async countThreadMessages(threadId) {
      const res = await admin.from('chat_messages').select('id', { count: 'exact', head: true }).eq('thread_id', threadId);
      must(res, 'count_thread');
      return res.count ?? 0;
    },
    async loadContextData(userId, threadId, { since30 }) {
      const [profile, skin, settings, reactions, products, routines, scans, completions, changes, thread, messages] = await Promise.all([
        admin.from('profiles').select('display_name, birth_date').eq('user_id', userId).maybeSingle(),
        admin.from('skin_profiles').select('goals, routine_level, budget, textures').eq('user_id', userId).maybeSingle(),
        admin.from('user_settings').select('persona, locale, timezone').eq('user_id', userId).maybeSingle(),
        admin.from('product_reactions').select('id, product_id, ingredient, reaction, severity, noted_at').eq('user_id', userId).is('resolved_at', null),
        admin.from('user_products').select('id, name, brand, category, status, use_time, key_actives, ingredients_text, opened_at').eq('user_id', userId).in('status', ['active', 'paused']).order('created_at'),
        admin.from('routines').select('id, period, version, routine_steps(position, step_type, name, product_id)').eq('user_id', userId).eq('is_active', true),
        admin.from('scans').select('id, completed_at, provider, provider_model_version, capture_protocol_version, scan_metrics(metric_code, value, metric_definition_version)').eq('user_id', userId).eq('status', 'succeeded').order('completed_at', { ascending: false }).limit(4),
        admin.from('routine_completions').select('period, local_date').eq('user_id', userId).gte('local_date', since30.slice(0, 10)),
        admin.from('profile_change_events').select('entity, field, old_value, new_value, source, created_at').eq('user_id', userId).gte('created_at', since30).order('created_at', { ascending: false }).limit(20),
        admin.from('chat_threads').select('summary').eq('id', threadId).maybeSingle(),
        admin.from('chat_messages').select('role, content, created_at').eq('thread_id', threadId).order('created_at', { ascending: false }).limit(10),
      ]);
      const p = must(profile, 'profile') ?? {};
      const sk = must(skin, 'skin_profile') ?? {};
      const st = must(settings, 'settings') ?? {};
      return {
        profile: { display_name: p.display_name ?? null, birth_date: p.birth_date ?? null, goals: sk.goals ?? [], routine_level: sk.routine_level ?? null, budget: sk.budget ?? null, textures: sk.textures ?? [] },
        settings: { persona: st.persona ?? 'gentle', locale: st.locale ?? 'zh-TW', timezone: st.timezone ?? 'Asia/Taipei' },
        reactions: must(reactions, 'reactions'),
        products: must(products, 'products'),
        routines: (must(routines, 'routines') as { id: string; period: 'am' | 'pm'; version: number | null; routine_steps: ContextData['routines'][number]['steps'] }[]).map((r) => ({ id: r.id, period: r.period, version: r.version, steps: r.routine_steps })),
        scans: (must(scans, 'scans') as { scan_metrics: { metric_code: string; value: number | string; metric_definition_version: string }[]; [k: string]: unknown }[]).map((s) => ({
          ...s,
          metrics: s.scan_metrics.map((m) => ({ ...m, value: Number(m.value) })),
        })) as ContextData['scans'],
        completions: must(completions, 'completions'),
        changes: must(changes, 'changes'),
        summary: must(thread, 'thread')?.summary ?? null,
        messages: (must(messages, 'messages') as ContextData['messages']).reverse(),
      } as ContextData;
    },
    async loadProposalState(userId) {
      const [products, routines, reactions, rules] = await Promise.all([
        admin.from('user_products').select('id, name, brand, category, status, key_actives').eq('user_id', userId).in('status', ['active', 'paused']),
        admin.from('routines').select('period, routine_steps(position, step_type, product_id, name)').eq('user_id', userId).eq('is_active', true),
        admin.from('product_reactions').select('product_id, ingredient').eq('user_id', userId).is('resolved_at', null),
        admin.from('active_conflict_rules').select('active_a, active_b, rule'),
      ]);
      const byPeriod = { am: [] as ProposalState['routines']['am'], pm: [] as ProposalState['routines']['pm'] };
      for (const r of must(routines, 'routines') as { period: 'am' | 'pm'; routine_steps: ProposalState['routines']['am'] }[]) byPeriod[r.period] = r.routine_steps;
      return { products: must(products, 'products'), routines: byPeriod, reactions: must(reactions, 'reactions'), rules: must(rules, 'rules') } as ProposalState;
    },
    async insertCandidateRoutine(userId, period, steps) {
      const row = must(await admin.from('routines').insert({ user_id: userId, period, is_active: false, source: 'system' }).select('id').single(), 'insert_candidate');
      must(await admin.from('routine_steps').insert(steps.map((s) => ({ user_id: userId, routine_id: row.id, position: s.position, step_type: s.step_type, product_id: s.product_id, name: s.name }))), 'insert_candidate_steps');
      return { id: row.id as string };
    },
    async saveSummary(threadId, summary, throughMessageId) {
      must(await admin.from('chat_threads').update({ summary, summary_through_message_id: throughMessageId }).eq('id', threadId), 'save_summary');
    },
    async getMessageBlock(userId, threadId, messageId, blockId) {
      const row = must(await admin.from('chat_messages').select('blocks').eq('id', messageId).eq('thread_id', threadId).eq('user_id', userId).eq('role', 'assistant').maybeSingle(), 'get_block');
      return row ? parseBlocks(row.blocks).find((b) => b.id === blockId) ?? null : null;
    },
    async applyAction({ userId, threadId, messageId, blockId, action }): Promise<ApplyResult> {
      const res = await admin.rpc('apply_chat_action', { p_user_id: userId, p_thread_id: threadId, p_message_id: messageId, p_block_id: blockId, p_action: action });
      if (res.error) {
        const msg: string = res.error.message ?? '';
        if (msg.includes('forbidden')) return 'forbidden';
        if (msg.includes('already_acted') || res.error.code === '23505') return 'already_acted';
        if (msg.includes('invalid_action') || res.error.code === '23514' || res.error.code === '22P02') return 'invalid_action';
        console.error(`chat: apply_action ${res.error.code ?? ''}`);
        throw new ScanError('db_failed', 500, 'apply_action');
      }
      return res.data as ApplyResult;
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const env = (k: string) => Deno.env.get(k);
  const admin = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let llm;
  try {
    llm = createLlm(llmEnvFrom(env, 'LLM_MODEL_CHAT'));
  } catch (e) {
    console.error('chat: llm not configured');
    return json(500, { error: e instanceof ScanError ? e.code : 'llm_not_configured' });
  }
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? null;
  const body = await req.json().catch(() => null);
  const res = await handleChat({ jwt, body }, {
    getUser: async (token) => {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    db: supabaseChatDb(admin),
    llm,
  });
  return json(res.status, res.body);
});
