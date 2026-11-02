// A short, plain-language "facts" list chosen per question, so a small model sees the few lines that matter
// before the full JSON sections. English (the prompt language); every user-typed value (product names,
// ingredients) is inserted with JSON.stringify so it stays a quoted string, never prose the model could read
// as an instruction. The whole list is itself a JSON array inside DATA.
import type { MetricCode } from '../codes.ts';
import { comparable, type ScanVersion } from '../rules/goals.ts';
import { METRIC_LABELS } from '../templates.ts';
import { ageBand, changeWord, daysAgo } from './build.ts';
import type { ContextData, ContextOpts } from './types.ts';

export type Topic = 'routine' | 'products' | 'scan' | 'reactions' | 'adherence' | 'general';

const KEYWORDS: Record<Exclude<Topic, 'general'>, RegExp> = {
  routine: /routine|tonight|morning|evening|night|\bam\b|\bpm\b|\bsteps?\b|order|流程|保養|早上|晚上|今晚|順序|步驟/i,
  products: /product|cleanser|serum|toner|cream|moisturi[sz]er|sunscreen|spf|mask|bought|\bbuy\b|\bown\b|產品|潔顏|洗面|精華|化妝水|乳霜|乳液|防曬|面膜|買|擁有/i,
  scan: /check-?in|scan|number|score|metric|trend|檢測|數字|分數|趨勢/i,
  reactions: /sting|burn|itch|react|irritat|redness|\bred\b|tight|flak|peel|breakout|刺痛|灼熱|癢|過敏|泛紅|緊繃|脫皮|反應|痘/i,
  adherence: /skip|miss|streak|every day|each day|consisten|沒做|漏|每天|連續|打卡/i,
};

export function detectTopics(message: string): Topic[] {
  const hits = (Object.keys(KEYWORDS) as Exclude<Topic, 'general'>[]).filter((t) => KEYWORDS[t].test(message));
  return hits.length ? hits : ['general'];
}

export const MAX_FACTS = 12;
const q = (s: string) => JSON.stringify(s);
const label = (code: string) => METRIC_LABELS.en[code as MetricCode] ?? code;
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export function pickFacts(data: ContextData, message: string, opts: ContextOpts): string[] {
  const topics = detectTopics(message);
  const want = (t: Exclude<Topic, 'general'>) => topics.includes('general') || topics.includes(t);
  const name = new Map(data.products.map((p) => [p.id, [p.brand, p.name].filter(Boolean).join(' ')]));
  const lines: string[] = [];

  const p = data.profile;
  lines.push([p.display_name, ageBand(p.birth_date, opts.now), p.goals.length ? `goals ${p.goals.join(', ')}` : null, p.routine_level, p.budget ? `budget ${p.budget}` : null, p.textures.length ? `prefers ${p.textures.join(', ')}` : null].filter(Boolean).join(', '));

  const version = (s: ContextData['scans'][number]): ScanVersion => ({ provider: s.provider, provider_model_version: s.provider_model_version, capture_protocol_version: s.capture_protocol_version, metric_definition_version: s.metrics[0]?.metric_definition_version ?? '' });
  const scanLine = (title: string, s: ContextData['scans'][number], older?: ContextData['scans'][number]) => {
    const prev = older && comparable(version(s), version(older)) ? new Map(older.metrics.map((m) => [m.metric_code, m.value])) : null;
    const parts = s.metrics.map((m) => {
      const before = prev?.get(m.metric_code);
      return `${label(m.metric_code)} ${m.value}${before === undefined ? '' : ` (${changeWord(m.value, before)}, ${signed(Math.round((m.value - before) * 10) / 10)} since ${older!.completed_at.slice(0, 10)})`}`;
    });
    return `${title} ${s.completed_at.slice(0, 10)}: ${parts.join(', ')}`;
  };
  const [latest, previous, older] = data.scans;
  lines.push(latest ? scanLine('Latest check-in', latest, previous) : 'No check-in yet');
  if (want('scan') && previous) lines.push(scanLine('Previous check-in', previous, older));

  if (want('routine') || want('adherence')) {
    for (const r of data.routines) {
      const steps = [...r.steps].sort((a, b) => a.position - b.position).map((s) => (s.product_id && name.get(s.product_id) ? `${s.step_type} (${q(name.get(s.product_id)!)})` : s.step_type));
      lines.push(`${r.period.toUpperCase()} routine${r.version === null ? '' : ` v${r.version}`}: ${steps.join(' → ')}`);
    }
  }
  if (want('products') || want('reactions')) {
    for (const pr of data.products) {
      const bits = [pr.category, pr.status, pr.use_time, pr.key_actives.length ? `actives ${pr.key_actives.join(', ')}` : null, pr.opened_at ? `opened ${pr.opened_at}` : null].filter(Boolean);
      lines.push(`Product ${q(name.get(pr.id)!)}: ${bits.join(', ')}`);
    }
  }
  if (want('reactions')) {
    for (const r of data.reactions) {
      const to = r.product_id && name.get(r.product_id) ? q(name.get(r.product_id)!) : r.ingredient ? q(r.ingredient) : 'unknown';
      lines.push(`Reaction: ${r.reaction} (${r.severity}) to ${to}, noted ${r.noted_at.slice(0, 10)}`);
    }
  }
  if (want('adherence')) {
    const count = (days: number, period: 'am' | 'pm') => data.completions.filter((c) => c.period === period && c.local_date >= daysAgo(opts.today, days - 1) && c.local_date <= opts.today).length;
    lines.push(`Last 7 days: AM ${count(7, 'am')}/7, PM ${count(7, 'pm')}/7. Last 30 days: AM ${count(30, 'am')}/30, PM ${count(30, 'pm')}/30`);
  }
  return lines.slice(0, MAX_FACTS);
}
