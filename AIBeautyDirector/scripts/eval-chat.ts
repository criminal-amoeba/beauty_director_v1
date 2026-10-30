/// <reference types="node" />
// Eval harness: runs scripts/eval-cases.ts through the real chat handler (fake DB, real or mock LLM) and the
// real scan review writer, then writes a markdown report to read replies side by side.
//   node --experimental-transform-types scripts/eval-chat.ts [--model gpt-5-nano] [--reasoning minimal|low|medium] [--out path.md] [--only a,b] [--mock]
// Key: CHATGPT_KEY or LLM_API_KEY from the environment, else from AIBeautyDirector/.env or supabase/functions/.env
// (the Edge Function secrets file; never read by the app).
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createLlm, type Llm, type LlmRequest, type LlmResponse } from '../supabase/functions/_shared/adapters/llm.ts';
import type { Block } from '../supabase/functions/_shared/chat/blocks.ts';
import { ScanError } from '../supabase/functions/_shared/codes.ts';
import type { ContextData } from '../supabase/functions/_shared/context/types.ts';
import { buildUserMessage, toPersona } from '../supabase/functions/_shared/persona.ts';
import { checkReply } from '../supabase/functions/_shared/safety/check.ts';
import { fakeDb, THREAD, UID } from '../supabase/functions/chat/__fixtures__/fake-db.ts';
import { handleChat } from '../supabase/functions/chat/handler.ts';
import { writeReview } from '../supabase/functions/run-weekly-scan/handler.ts';
import { CASES, type EvalCase } from './eval-cases.ts';

type Call = { json: boolean; ms: number; promptTokens: number | null; completionTokens: number | null; reasoningTokens: number | null; error: string | null };
export type Turn = { user: string | null; reply: string; blocks: Block[]; model: string | null; hits: string[]; calls: Call[]; log: string[]; flags: string[]; ms: number };
export type CaseResult = { id: string; kind: EvalCase['kind']; locale: string; persona: string; note: string; data?: string; turns: Turn[] };
export type EvalReport = {
  model: string;
  date: string;
  commit: string;
  results: CaseResult[];
  summary: { cases: number; turns: number; fallback: number; empty: number; length: number; safety: Record<string, number>; expected: number; got: number; meanPrompt: number; meanCompletion: number; meanReasoning: number; meanMs: number };
};

const NOW = Date.parse('2026-10-30T12:00:00Z');

// Wraps an Llm, recording tokens, latency and errors per call so a turn can show what the model cost.
function recorder(inner: Llm): Llm & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const t = Date.now();
      try {
        const res = await inner.complete(req);
        calls.push({ json: !!req.json, ms: Date.now() - t, promptTokens: res.promptTokens, completionTokens: res.completionTokens, reasoningTokens: res.reasoningTokens, error: null });
        return res;
      } catch (e) {
        calls.push({ json: !!req.json, ms: Date.now() - t, promptTokens: null, completionTokens: null, reasoningTokens: null, error: e instanceof ScanError ? `${e.code}${e.detail ? ` ${String(e.detail)}` : ''}` : (e as Error).name });
        throw e;
      }
    },
  };
}

// Captures console.log/warn while fn runs (the handler's own log lines are the most useful diagnostics).
async function captureLog<T>(fn: () => Promise<T>): Promise<{ value: T; log: string[] }> {
  const log: string[] = [];
  const orig = { log: console.log, warn: console.warn };
  console.log = (...a: unknown[]) => { log.push(a.map(String).join(' ')); };
  console.warn = (...a: unknown[]) => { log.push(a.map(String).join(' ')); };
  try {
    return { value: await fn(), log };
  } finally {
    console.log = orig.log;
    console.warn = orig.warn;
  }
}

export async function runEval(opts: { llm: Llm; model: string; cases: EvalCase[]; now?: () => number }): Promise<EvalReport> {
  const llm = recorder(opts.llm);
  const now = opts.now ?? (() => NOW);
  const results: CaseResult[] = [];
  for (const c of opts.cases) {
    const r: CaseResult = { id: c.id, kind: c.kind, locale: c.locale, persona: c.persona, note: c.note, turns: [] };
    if (c.kind === 'chat') {
      const history: ContextData['messages'] = [];
      for (const text of c.turns) {
        const settings = { persona: c.persona, locale: c.locale, timezone: 'Asia/Taipei' };
        const fake = fakeDb({ data: { ...c.data, settings, messages: history } });
        const from = llm.calls.length;
        const t = Date.now();
        const { value: res, log } = await captureLog(() =>
          handleChat({ jwt: 'good', body: { kind: 'message', text, thread_id: THREAD } }, { getUser: async () => ({ id: UID }), db: fake.db, llm, now, deadlineMs: 120_000 }),
        );
        const body = res.body as { messages?: { role: string; content: string; blocks: Block[]; created_at: string }[]; error?: string };
        const assistant = body.messages?.[1];
        const reply = assistant?.content ?? `ERROR ${body.error ?? res.status}`;
        const model = (fake.messages[1] as { model?: string | null } | undefined)?.model ?? null;
        const hits = checkReply(reply).hits;
        const flags: string[] = [];
        if (!assistant || model === null) flags.push('FALLBACK');
        if (hits.length > 0) flags.push('SAFETY');
        if (c.expectBlocks && !(assistant?.blocks ?? []).some((b) => c.expectBlocks!.includes(b.type))) flags.push(`MISSING BLOCK ${c.expectBlocks.join('|')}`);
        r.turns.push({ user: text, reply, blocks: assistant?.blocks ?? [], model, hits, calls: llm.calls.slice(from), log, flags, ms: Date.now() - t });
        for (const m of body.messages ?? []) history.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content, created_at: m.created_at });
      }
    } else {
      r.data = buildUserMessage(c.review, c.firstScan);
      const from = llm.calls.length;
      const t = Date.now();
      const { value: msg, log } = await captureLog(() => writeReview(c.review, { persona: toPersona(c.persona), locale: c.locale, firstScan: c.firstScan }, llm, AbortSignal.timeout(120_000)));
      const hits = checkReply(msg.content).hits;
      const flags = [...(msg.model === null ? ['FALLBACK'] : []), ...(hits.length ? ['SAFETY'] : [])];
      r.turns.push({ user: null, reply: msg.content, blocks: [], model: msg.model, hits, calls: llm.calls.slice(from), log, flags, ms: Date.now() - t });
    }
    results.push(r);
  }
  return { model: opts.model, date: new Date().toISOString().slice(0, 10), commit: gitHash(), results, summary: summarize(results, opts.cases) };
}

function summarize(results: CaseResult[], cases: EvalCase[]): EvalReport['summary'] {
  const turns = results.flatMap((r) => r.turns);
  const calls = turns.flatMap((t) => t.calls);
  const safety: Record<string, number> = {};
  for (const t of turns) for (const h of t.hits) safety[h] = (safety[h] ?? 0) + 1;
  const mean = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0; };
  const expected = cases.filter((c) => c.kind === 'chat' && c.expectBlocks).length;
  return {
    cases: results.length,
    turns: turns.length,
    fallback: turns.filter((t) => t.flags.includes('FALLBACK')).length,
    empty: calls.filter((c) => c.error?.endsWith('empty')).length,
    length: calls.filter((c) => c.error?.endsWith('length')).length,
    safety,
    expected,
    got: expected - turns.filter((t) => t.flags.some((f) => f.startsWith('MISSING BLOCK'))).length,
    meanPrompt: mean(calls.map((c) => c.promptTokens)),
    meanCompletion: mean(calls.map((c) => c.completionTokens)),
    meanReasoning: mean(calls.map((c) => c.reasoningTokens)),
    meanMs: mean(turns.map((t) => t.ms)),
  };
}

function gitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

const quote = (s: string) => s.split('\n').map((l) => `> ${l}`).join('\n');

export function renderReport(r: EvalReport): string {
  const s = r.summary;
  const safety = Object.entries(s.safety).map(([k, v]) => `${k}:${v}`).join(', ') || 'none';
  const out: string[] = [
    `# Chat eval: ${r.model} (${r.date}, prompts @ ${r.commit})`,
    '',
    '| cases | turns | fallbacks | empty | length cut-offs | safety hits | blocks expected → got | mean tokens prompt / completion / reasoning | mean ms per turn |',
    '|---|---|---|---|---|---|---|---|---|',
    `| ${s.cases} | ${s.turns} | ${s.fallback} | ${s.empty} | ${s.length} | ${safety} | ${s.expected} → ${s.got} | ${s.meanPrompt} / ${s.meanCompletion} / ${s.meanReasoning} | ${s.meanMs} |`,
    '',
    'Flags: `FALLBACK` = template stored (model null) · `SAFETY` = checkReply hit on the stored text · `MISSING BLOCK` = none of the expected block types came back.',
    '',
  ];
  for (const c of r.results) {
    const flagged = c.turns.flatMap((t) => t.flags);
    out.push(`## ${c.id}${flagged.length ? `  ⚠ ${[...new Set(flagged)].join(' · ')}` : ''}`, '', `*${c.kind} · ${c.locale} · ${c.persona}* — ${c.note}`, '');
    if (c.data) out.push('```json', c.data, '```', '');
    for (const t of c.turns) {
      if (t.user !== null) out.push(`**User:** ${t.user}`, '');
      out.push(`**Director** (${t.model ?? 'template'}):`, '', quote(t.reply), '');
      if (t.blocks.length) out.push('```json', JSON.stringify(t.blocks), '```', '');
      const calls = t.calls.map((k) => `${k.json ? 'blocks' : 'text'} ${k.error ? `ERROR ${k.error}` : `${k.promptTokens ?? '-'}/${k.completionTokens ?? '-'}/${k.reasoningTokens ?? '-'}`} ${k.ms}ms`).join(' · ');
      out.push(`calls: ${calls || 'none'} · turn ${t.ms}ms · hits: ${t.hits.join(',') || 'none'}${t.flags.length ? ` · **${t.flags.join(' · ')}**` : ''}`, '');
      const warnings = t.log.filter((l) => /rejected|proposal rejected|llm /.test(l));
      if (warnings.length) out.push('<details><summary>server log</summary>', '', '```', ...warnings, '```', '', '</details>', '');
    }
  }
  return out.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function readKey(): string {
  const fromEnv = process.env.CHATGPT_KEY ?? process.env.LLM_API_KEY;
  if (fromEnv) return fromEnv;
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  for (const file of [resolve(root, '.env'), resolve(root, 'supabase', 'functions', '.env')]) {
    try {
      const line = readFileSync(file, 'utf8').split(/\r?\n/).find((l) => /^(CHATGPT_KEY|LLM_API_KEY)=/.test(l));
      if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
    } catch {
      // next file
    }
  }
  return '';
}

async function main() {
  const model = arg('model') ?? 'gpt-5-nano';
  const mock = process.argv.includes('--mock');
  const only = arg('only')?.split(',');
  const cases = only ? CASES.filter((c) => only.includes(c.id)) : CASES;
  const key = mock ? '' : readKey();
  if (!mock && !key) {
    console.error('No key: set CHATGPT_KEY (or LLM_API_KEY) in the environment or in AIBeautyDirector/.env, or pass --mock.');
    process.exit(1);
  }
  const reasoning = arg('reasoning'); // minimal | low | medium | high; unset = API default
  const llm = createLlm({ mode: mock ? 'mock' : 'real', provider: 'openai', apiKey: key, model, reasoningEffort: reasoning });
  const report = await runEval({ llm, model: mock ? 'mock' : `${model}${reasoning ? ` (${reasoning})` : ''}`, cases });
  const md = renderReport(report);
  const out = arg('out') ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'eval', `${report.date}-${mock ? 'mock' : model}${reasoning ? `-${reasoning}` : ''}.md`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, md, 'utf8');
  console.log(md.split('\n').slice(2, 5).join('\n'));
  console.log(`\nreport: ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
