// Chat pipeline (step 10): auth → limits → thread → user message → context → LLM text (plain, safety-checked, one
// stricter retry, else the locale fallback) → LLM intents (second small JSON call from that text; unsafe or
// malformed ones dropped) → intents resolved into blocks with server-made ids → assistant message → summary
// every N messages. Actions: the tapped block is re-read from the stored message and applied
// only by the apply_chat_action RPC. The LLM never writes user data; user text is only ever JSON data.
import { z } from 'zod';
import type { Llm } from '../_shared/adapters/llm.ts';
import { ACTIONS_FOR_BLOCK, ActionSchema, type Block } from '../_shared/chat/blocks.ts';
import { blockStrings, parseLlmBlocks, type LlmBlock } from '../_shared/chat/llm-output.ts';
import { CHAT_LIMITS, type ChatDb, type ChatDeps, type StoredMessage } from '../_shared/chat-db.ts';
import { ScanError, toLocale, type Locale, type MetricCode } from '../_shared/codes.ts';
import { estimateTokens } from '../_shared/context/budget.ts';
import { buildContext, renderContext } from '../_shared/context/build.ts';
import type { ContextData, ContextPack } from '../_shared/context/types.ts';
import { BLOCKS_PROMPT, buildChatSystemPrompt, SUMMARY_PROMPT, toPersona, type Persona } from '../_shared/persona.ts';
import { BUDGETS, GOALS, KEY_ACTIVES, LEVELS, PRODUCT_STATUSES, REACTIONS, SEVERITIES, TEXTURES, USE_TIMES } from '../_shared/rules/actives.ts';
import { comparable } from '../_shared/rules/goals.ts';
import { buildProposal, displayName, resolveProductName, type ProposalState } from '../_shared/rules/proposal.ts';
import { RULES_CONFIG } from '../_shared/rules/review.ts';
import { checkReply, stripMarkdown } from '../_shared/safety/check.ts';
import { CHAT_FALLBACK, METRIC_LABELS } from '../_shared/templates.ts';
import { llmFailureKey, tally, tallyLine } from '../_shared/telemetry.ts';

export type HandlerResult = { status: number; body: unknown };
const fail = (status: number, code: string): HandlerResult => ({ status, body: { error: code } });

const RequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('message'), thread_id: z.uuid().optional(), text: z.string() }),
  z.object({ kind: z.literal('action'), thread_id: z.uuid(), message_id: z.uuid(), block_id: z.string().regex(/^b\d{1,2}$/), action: ActionSchema }),
]);

export async function handleChat(req: { jwt: string | null; body: unknown }, deps: ChatDeps): Promise<HandlerResult> {
  if (!req.jwt) return fail(401, 'unauthorized');
  const user = await deps.getUser(req.jwt);
  if (!user) return fail(401, 'unauthorized');
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) return fail(400, 'invalid_request');
  try {
    return parsed.data.kind === 'message'
      ? await handleMessage(user.id, parsed.data.thread_id ?? null, parsed.data.text, deps)
      : await handleAction(user.id, parsed.data, deps);
  } catch (e) {
    const code = e instanceof ScanError ? e.code : 'db_failed';
    console.error(`chat: ${code}`);
    return fail(e instanceof ScanError ? e.status : 500, code);
  }
}

async function handleMessage(userId: string, threadIdIn: string | null, rawText: string, deps: ChatDeps): Promise<HandlerResult> {
  const now = deps.now ?? Date.now;
  const { db } = deps;
  const text = rawText.trim();
  if (!text) return fail(400, 'invalid_request');
  if (text.length > CHAT_LIMITS.maxChars) return fail(400, 'message_too_long');
  if ((await db.countUserMessagesSince(userId, iso(now() - 3_600_000))) >= CHAT_LIMITS.perHour) return fail(429, 'rate_limited');

  let threadId = threadIdIn;
  if (threadId) {
    if (!(await db.findThread(userId, threadId))) return fail(403, 'forbidden');
  } else {
    threadId = (await db.latestChatThread(userId, iso(now() - CHAT_LIMITS.threadReuseMs)))?.id ?? (await db.createThread(userId)).id;
  }
  if (!(await db.claimThread(threadId, iso(now() + CHAT_LIMITS.busyMs), iso(now())))) return fail(409, 'thread_busy');

  const started = now();
  const signal = AbortSignal.timeout(deps.deadlineMs ?? 45_000);
  try {
    const userMessage = await db.insertMessage({ user_id: userId, thread_id: threadId, role: 'user', content: text, blocks: [] });
    const data = await db.loadContextData(userId, threadId, { since30: iso(now() - 30 * 86_400_000) });
    const locale = toLocale(data.settings.locale);
    const persona = toPersona(data.settings.persona);
    const reservedTokens = estimateTokens(buildChatSystemPrompt({ persona, locale })) + 300; // system prompt + reply instructions
    const pack = buildContext(data, text, { now: now(), today: localDate(now(), data.settings.timezone), budgetTokens: CHAT_LIMITS.budgetTokens, reservedTokens });
    const reply = await askText(deps.llm, { persona, locale, user: renderContext(pack, text), signal });
    const intents = reply.fromTemplate ? NO_BLOCKS : await askBlocks(deps.llm, { reply: reply.text, newMessage: text, pack, locale, signal });

    let state: ProposalState | null = null;
    const loadState = async () => (state ??= await db.loadProposalState(userId));
    const blocks = await resolveBlocks(intents.blocks, {
      data,
      loadState,
      insertCandidate: (period, steps) => db.insertCandidateRoutine(userId, period, steps),
    });
    const assistant = await db.insertMessage({
      user_id: userId,
      thread_id: threadId,
      role: 'assistant',
      content: clip(reply.text, CHAT_LIMITS.maxStoredChars),
      blocks,
      model: reply.model,
      prompt_tokens: sum(reply.promptTokens, intents.promptTokens),
      completion_tokens: sum(reply.completionTokens, intents.completionTokens),
    });
    await db.touchThread(threadId, iso(now()));

    const count = await db.countThreadMessages(threadId);
    if (count > 0 && count % CHAT_LIMITS.summaryEvery === 0) {
      await refreshSummary(deps.llm, db, threadId, assistant, data, [userMessage, assistant], locale, signal);
    }
    console.log(`chat: ok thread=${threadId} model=${reply.model ?? 'template'} tokens=${sum(reply.promptTokens, intents.promptTokens) ?? '-'}/${sum(reply.completionTokens, intents.completionTokens) ?? '-'}/${reply.reasoningTokens ?? '-'} est=${pack.estimatedTokens} blocks=${blocks.length} dropped=[${pack.dropped.join(',')}] ms=${now() - started} tally=${tallyLine()}`);
    return { status: 200, body: { thread_id: threadId, messages: [userMessage, assistant] } };
  } finally {
    await db.releaseThread(threadId).catch(() => console.error('chat: release failed'));
  }
}

async function handleAction(userId: string, a: { thread_id: string; message_id: string; block_id: string; action: z.infer<typeof ActionSchema> }, deps: ChatDeps): Promise<HandlerResult> {
  const block = await deps.db.getMessageBlock(userId, a.thread_id, a.message_id, a.block_id);
  if (!block) return fail(400, 'block_not_found');
  if (!(ACTIONS_FOR_BLOCK[block.type] as readonly string[]).includes(a.action.type)) return fail(400, 'action_mismatch');
  const res = await deps.db.applyAction({ userId, threadId: a.thread_id, messageId: a.message_id, blockId: a.block_id, action: a.action });
  if (res === 'forbidden') return fail(403, 'forbidden');
  if (res === 'already_acted') return fail(409, 'already_acted');
  if (res === 'invalid_action') return fail(400, 'invalid_action');
  console.log(`chat: action ${a.action.type} ${res.result} thread=${a.thread_id}`);
  return { status: 200, body: res };
}

// ── LLM ─────────────────────────────────────────────────────────────────────
type TextReply = { text: string; model: string | null; promptTokens: number | null; completionTokens: number | null; reasoningTokens: number | null; fromTemplate: boolean };

// Plain-text reply, safety-checked on its markdown-stripped form, one stricter retry, else the locale fallback.
// Never throws.
export async function askText(llm: Llm, o: { persona: Persona; locale: Locale; user: string; signal: AbortSignal }): Promise<TextReply> {
  for (const stricter of [false, true]) {
    try {
      const res = await llm.complete({ system: buildChatSystemPrompt({ persona: o.persona, locale: o.locale, stricter }), user: o.user, maxTokens: CHAT_LIMITS.replyTokens, locale: o.locale, signal: o.signal });
      const text = res.text.trim();
      const hits = checkReply(stripMarkdown(text)).hits;
      if (text && hits.length === 0) {
        tally('ok');
        return { text, model: res.model, promptTokens: res.promptTokens, completionTokens: res.completionTokens, reasoningTokens: res.reasoningTokens, fromTemplate: false };
      }
      if (text) for (const h of hits) tally('safety', h);
      else tally('empty');
      console.warn(`chat: text rejected reason=${text ? `safety hits=${hits.join(',')}` : 'empty'} stricter=${stricter}`);
    } catch (e) {
      tally(llmFailureKey(e));
      console.warn(`chat: text rejected reason=${e instanceof ScanError ? `${e.code}${e.detail ? ` ${e.detail}` : ''}` : (e as Error).name} stricter=${stricter}`);
      if (o.signal.aborted) break;
    }
  }
  tally('fallback');
  return { text: CHAT_FALLBACK[o.locale], model: null, promptTokens: null, completionTokens: null, reasoningTokens: null, fromTemplate: true };
}

// Second, small JSON call: which intents belong under the reply. One try; any failure means no blocks. A block
// whose wording fails the safety check is dropped on its own. Only names go out, never ids.
type BlocksReply = { blocks: LlmBlock[]; promptTokens: number | null; completionTokens: number | null };
const NO_BLOCKS: BlocksReply = { blocks: [], promptTokens: null, completionTokens: null };
const sum = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0));

export async function askBlocks(llm: Llm, o: { reply: string; newMessage: string; pack: ContextPack; locale: Locale; signal: AbortSignal }): Promise<BlocksReply> {
  const sections = o.pack.sections as { products?: { name: string; brand: string | null }[]; routine?: unknown; scans?: { list?: unknown[] } };
  const data = {
    reply: o.reply,
    new_message: o.newMessage,
    products: (sections.products ?? []).map(displayName),
    routine: sections.routine ?? null,
    has_scan: (sections.scans?.list?.length ?? 0) > 0,
  };
  try {
    const res = await llm.complete({ system: BLOCKS_PROMPT, user: `DATA\n${JSON.stringify(data, null, 1)}`, maxTokens: CHAT_LIMITS.blockTokens, locale: o.locale, signal: o.signal, json: true });
    const blocks = parseLlmBlocks(res.text).filter((b) => {
      const hits = blockStrings(b).flatMap((s) => checkReply(stripMarkdown(s)).hits);
      for (const h of hits) tally('safety', h);
      if (hits.length) console.warn(`chat: block dropped type=${b.type} hits=${hits.join(',')}`);
      return hits.length === 0;
    });
    return { blocks, promptTokens: res.promptTokens, completionTokens: res.completionTokens };
  } catch (e) {
    console.warn(`chat: blocks skipped reason=${e instanceof ScanError ? `${e.code}${e.detail ? ` ${e.detail}` : ''}` : (e as Error).name}`);
    return NO_BLOCKS;
  }
}

async function refreshSummary(llm: Llm, db: ChatDb, threadId: string, through: StoredMessage, data: ContextData, fresh: StoredMessage[], locale: Locale, signal: AbortSignal) {
  try {
    const messages = [...data.messages, ...fresh].slice(-CHAT_LIMITS.contextMessages).map((m) => ({ role: m.role, content: m.content }));
    const user = `DATA\n${JSON.stringify({ previous_summary: data.summary, messages }, null, 1)}`;
    const res = await llm.complete({ system: SUMMARY_PROMPT, user, maxTokens: CHAT_LIMITS.summaryTokens, locale, signal });
    const summary = res.text.trim().slice(0, CHAT_LIMITS.summaryChars);
    if (summary && checkReply(summary).ok) await db.saveSummary(threadId, summary, through.id);
  } catch (e) {
    console.warn(`chat: summary skipped ${e instanceof ScanError ? e.code : (e as Error).name}`);
  }
}

// ── Intents → blocks ────────────────────────────────────────────────────────
export type ResolveCtx = {
  data: ContextData;
  loadState: () => Promise<ProposalState>;
  insertCandidate: (period: 'am' | 'pm', steps: ProposalState['routines']['am']) => Promise<{ id: string }>;
};

// A block before the server assigns its id (distributive, so each variant keeps its own fields).
type BlockDraft = { [K in Block['type']]: Omit<Extract<Block, { type: K }>, 'id'> }[Block['type']];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CHANGE_FIELDS: Record<string, Record<string, z.ZodType>> = {
  skin_profile: { goals: z.array(z.enum(GOALS)).max(GOALS.length), routine_level: z.enum(LEVELS), budget: z.enum(BUDGETS), textures: z.array(z.enum(TEXTURES)).max(TEXTURES.length) },
  product: { status: z.enum(PRODUCT_STATUSES), use_time: z.enum(USE_TIMES), key_actives: z.array(z.enum(KEY_ACTIVES)).max(KEY_ACTIVES.length), opened_at: z.string().regex(DATE) },
  reaction: {
    new: z.object({ ingredient: z.string().trim().min(1).max(80).optional(), product_name: z.string().trim().max(201).optional(), reaction: z.enum(REACTIONS), severity: z.enum(SEVERITIES).default('mild') }),
    resolved_at: z.unknown(),
  },
};

// Ids never come from the LLM: products are matched by name among the user's own, candidates are inserted here,
// change targets are resolved against the user's rows. Anything that doesn't resolve is dropped (text stays).
export async function resolveBlocks(intents: LlmBlock[], ctx: ResolveCtx): Promise<Block[]> {
  const out: BlockDraft[] = [];
  const opts = (labels: string[]) => labels.map((label, i) => ({ id: `o${i + 1}`, label }));
  for (const b of intents) {
    switch (b.type) {
      case 'quick_replies':
        out.push({ type: 'quick_replies', options: opts(b.options) });
        break;
      case 'choice':
        out.push({ type: 'choice', question: b.question, options: opts(b.options) });
        break;
      case 'product_mention': {
        const p = resolveProductName(b.name, (await ctx.loadState()).products);
        if (p === 'ambiguous') break;
        const card: BlockDraft = p === 'none'
          ? { type: 'product_card', mode: 'suggest_add', product_id: null, name: b.name, brand: b.brand ?? null, category: b.category ?? null }
          : { type: 'product_card', mode: 'owned', product_id: p.id, name: p.name, brand: p.brand, category: p.category };
        out.push(card);
        break;
      }
      case 'routine_intent': {
        const r = buildProposal({ kind: b.kind, period: b.period, product_name: b.product_name, step_type: b.step_type, reason: b.reason }, await ctx.loadState());
        if (!r.ok) {
          console.log(`chat: proposal rejected ${r.reason}`);
          break;
        }
        const { id } = await ctx.insertCandidate(r.period, r.steps);
        out.push({ type: 'routine_proposal', candidate_routine_id: id, period: r.period, diff: r.diff, reason: b.reason });
        break;
      }
      case 'change_intent': {
        const schema = CHANGE_FIELDS[b.entity]?.[b.field];
        const v = schema?.safeParse(b.new_value);
        if (!schema || !v?.success) break;
        let row_id: string | null = null;
        let value: unknown = v.data;
        let label = '';
        if (b.entity === 'product') {
          const p = b.product_name ? resolveProductName(b.product_name, (await ctx.loadState()).products) : 'none';
          if (typeof p === 'string') break;
          row_id = p.id;
          label = `${displayName(p)}: ${fieldLabel(b.field).toLowerCase()} ${valueText(value)}`;
        } else if (b.entity === 'reaction' && b.field === 'new') {
          const d = v.data as { ingredient?: string; product_name?: string; reaction: string; severity: string };
          let product_id: string | null = null;
          if (d.product_name) {
            const p = resolveProductName(d.product_name, (await ctx.loadState()).products);
            if (typeof p === 'string') break;
            product_id = p.id;
          }
          if (!product_id && !d.ingredient) break;
          value = { product_id, ingredient: d.ingredient ?? null, reaction: d.reaction, severity: d.severity };
          const target = product_id ? displayName(ctx.data.products.find((p) => p.id === product_id) ?? { name: d.product_name ?? '', brand: null }) : d.ingredient!;
          label = `Reaction: ${d.reaction} (${d.severity}) to ${target}`;
        } else if (b.entity === 'reaction') {
          const names = new Map(ctx.data.products.map((p) => [p.id, displayName(p).toLowerCase()]));
          const q = (b.product_name ?? '').trim().toLowerCase();
          const hit = ctx.data.reactions.find((r) => (q && r.product_id && names.get(r.product_id) === q) || (q && r.ingredient?.toLowerCase() === q));
          if (!hit) break;
          row_id = hit.id;
          value = null;
          label = `Resolved: ${hit.ingredient ?? (hit.product_id ? names.get(hit.product_id) : null) ?? q}`;
        }
        if (!label) label = `${fieldLabel(b.field)}: ${valueText(value)}`;
        out.push({ type: 'confirm_change', entity: b.entity, row_id, field: b.field, new_value: value, label: label.slice(0, 120), reason: b.reason });
        break;
      }
      case 'scan_summary': {
        const card = scanSummary(ctx.data);
        if (card) out.push(card);
        break;
      }
    }
  }
  return out.map((b, i) => ({ ...b, id: `b${i + 1}` }) as Block);
}

function scanSummary(data: ContextData): BlockDraft | null {
  const [latest, older] = data.scans;
  if (!latest) return null;
  const version = (s: ContextData['scans'][number]) => ({ provider: s.provider, provider_model_version: s.provider_model_version, capture_protocol_version: s.capture_protocol_version, metric_definition_version: s.metrics[0]?.metric_definition_version ?? '' });
  const prev = older && comparable(version(latest), version(older)) ? new Map(older.metrics.map((m) => [m.metric_code, m.value])) : null;
  return {
    type: 'scan_summary',
    scan_id: latest.id,
    date: latest.completed_at.slice(0, 10),
    metrics: latest.metrics.slice(0, 12).map((m) => {
      const p = prev?.get(m.metric_code);
      const trend = p === undefined ? null : Math.abs(m.value - p) < RULES_CONFIG.trendDelta ? 'flat' : m.value > p ? 'up' : 'down';
      return { label: METRIC_LABELS.en[m.metric_code as MetricCode] ?? m.metric_code, value: m.value, trend };
    }),
  };
}

// What a confirm card shows: words, never ids or JSON. English only, like the other stored block text.
const fieldLabel = (field: string) => { const t = field.replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
const valueText = (v: unknown): string => (Array.isArray(v) ? v.map(valueText).join(', ') : typeof v === 'string' ? v.replace(/_/g, ' ') : String(v ?? ''));

// ── helpers ─────────────────────────────────────────────────────────────────
const iso = (ms: number) => new Date(ms).toISOString();

// Calendar date in the user's zone. shortcut: ignores the 02:00 routine-day boundary; fine for 7/30-day counts.
export function localDate(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

// Cuts at the last sentence end before `max`, else hard.
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('。'), head.lastIndexOf('! '), head.lastIndexOf('? '));
  const cut = end > max / 2 ? head.slice(0, end + 1) : head;
  // An odd number of ** means the cut fell inside a bold span: drop that opening marker.
  const bold = cut.match(/\*\*/g)?.length ?? 0;
  return (bold % 2 === 1 ? cut.slice(0, cut.lastIndexOf('**')) + cut.slice(cut.lastIndexOf('**') + 2) : cut).trimEnd();
}
