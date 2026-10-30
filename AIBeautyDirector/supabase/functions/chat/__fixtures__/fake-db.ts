// In-memory ChatDb for handler tests. Records every write so tests can assert "no writes" on rejected paths.
import type { Block } from '../../_shared/chat/blocks';
import type { ApplyResult, ChatDb, NewMessage, StoredMessage } from '../../_shared/chat-db';
import type { ContextData } from '../../_shared/context/types';
import type { ProposalState, VersionSteps } from '../../_shared/rules/proposal';

export const UID = '11111111-2222-4333-8444-555555555555';
export const OTHER = '99999999-2222-4333-8444-555555555555';
export const THREAD = 'aaaaaaaa-0000-4000-8000-000000000001';
export const SCAN_THREAD = 'aaaaaaaa-0000-4000-8000-000000000002';
export const PRODUCT = 'bbbbbbbb-0000-4000-8000-000000000001';
export const PRODUCT2 = 'bbbbbbbb-0000-4000-8000-000000000002';
export const REACTION = 'cccccccc-0000-4000-8000-000000000001';

export const baseData: ContextData = {
  profile: { display_name: 'Mei', birth_date: '1995-05-05', goals: ['hydration'], routine_level: 'beginner', budget: 'mid', textures: [] },
  settings: { persona: 'gentle', locale: 'en', timezone: 'Asia/Taipei' },
  reactions: [{ id: REACTION, product_id: null, ingredient: 'fragrance', reaction: 'redness', severity: 'mild', noted_at: '2026-10-01T00:00:00Z' }],
  products: [
    { id: PRODUCT, name: 'Hydra Serum', brand: 'Acme', category: 'serum', status: 'active', use_time: 'both', key_actives: ['hyaluronic_acid'], ingredients_text: null, opened_at: null },
    { id: PRODUCT2, name: 'Cream', brand: null, category: 'moisturizer', status: 'active', use_time: 'both', key_actives: [], ingredients_text: null, opened_at: null },
  ],
  routines: [
    { id: 'r-am', period: 'am', version: 1, steps: [{ position: 1, step_type: 'cleanse', name: null, product_id: null }, { position: 2, step_type: 'moisturize', name: null, product_id: PRODUCT2 }] },
    { id: 'r-pm', period: 'pm', version: 1, steps: [{ position: 1, step_type: 'cleanse', name: null, product_id: null }, { position: 2, step_type: 'moisturize', name: null, product_id: PRODUCT2 }] },
  ],
  scans: [
    { id: 'dddddddd-0000-4000-8000-000000000002', completed_at: '2026-10-28T00:00:00Z', provider: 'dermiq', provider_model_version: 'm1', capture_protocol_version: 'cp1', metrics: [{ metric_code: 'pore_visibility', value: 70, metric_definition_version: 'v1' }] },
    { id: 'dddddddd-0000-4000-8000-000000000001', completed_at: '2026-10-21T00:00:00Z', provider: 'dermiq', provider_model_version: 'm1', capture_protocol_version: 'cp1', metrics: [{ metric_code: 'pore_visibility', value: 60, metric_definition_version: 'v1' }] },
  ],
  completions: [],
  changes: [],
  summary: null,
  messages: [],
};

export const baseState = (): ProposalState => ({
  products: baseData.products.map((p) => ({ id: p.id, name: p.name, brand: p.brand, category: p.category as ProposalState['products'][number]['category'], status: p.status, key_actives: p.key_actives })),
  routines: {
    am: baseData.routines[0].steps.map((s) => ({ ...s, step_type: s.step_type as VersionSteps[number]['step_type'] })),
    pm: baseData.routines[1].steps.map((s) => ({ ...s, step_type: s.step_type as VersionSteps[number]['step_type'] })),
  },
  reactions: baseData.reactions.map((r) => ({ product_id: r.product_id, ingredient: r.ingredient })),
  rules: [],
});

export type Fake = {
  db: ChatDb;
  log: string[];
  messages: StoredMessage[];
  candidates: { id: string; period: string; steps: VersionSteps }[];
  threads: Record<string, { origin: string; busy_until: string | null; last_message_at: string; summary: string | null }>;
  summaries: string[];
  actions: unknown[];
};

export function fakeDb(over: {
  userMessagesLastHour?: number;
  data?: Partial<ContextData>;
  state?: Partial<ProposalState>;
  threadMessages?: number;
  blocks?: Record<string, Block>; // block id → block on message m1
  apply?: ApplyResult;
  busy?: boolean;
  latestThread?: string | null;
} = {}): Fake {
  const log: string[] = [];
  const messages: StoredMessage[] = [];
  const candidates: Fake['candidates'] = [];
  const summaries: string[] = [];
  const actions: unknown[] = [];
  const threads: Fake['threads'] = {
    [THREAD]: { origin: 'chat', busy_until: over.busy ? '2999-01-01T00:00:00.000Z' : null, last_message_at: '2026-10-30T09:00:00Z', summary: null },
    [SCAN_THREAD]: { origin: 'weekly_scan', busy_until: null, last_message_at: '2026-10-28T09:00:00Z', summary: null },
  };
  let seq = 0;
  const db: ChatDb = {
    countUserMessagesSince: async () => over.userMessagesLastHour ?? 0,
    findThread: async (userId, threadId) => (userId === UID && threads[threadId] ? { id: threadId, origin: threads[threadId].origin } : null),
    latestChatThread: async () => (over.latestThread === undefined ? { id: THREAD } : over.latestThread ? { id: over.latestThread } : null),
    createThread: async () => {
      log.push('create_thread');
      threads['new-thread'] = { origin: 'chat', busy_until: null, last_message_at: '', summary: null };
      return { id: 'new-thread' };
    },
    claimThread: async (threadId, until, nowIso) => {
      const t = threads[threadId];
      if (t.busy_until && t.busy_until > nowIso) return false;
      t.busy_until = until;
      log.push('claim');
      return true;
    },
    releaseThread: async (threadId) => {
      threads[threadId].busy_until = null;
      log.push('release');
    },
    insertMessage: async (row: NewMessage) => {
      log.push(`insert:${row.role}`);
      const m: StoredMessage = { id: `m${++seq}`, role: row.role, content: row.content, blocks: row.blocks, created_at: new Date().toISOString() };
      messages.push({ ...m, ...(row.model !== undefined ? { model: row.model } : {}) } as StoredMessage);
      return m;
    },
    touchThread: async (threadId, at) => {
      threads[threadId].last_message_at = at;
      log.push('touch');
    },
    countThreadMessages: async () => over.threadMessages ?? messages.length,
    loadContextData: async () => ({ ...baseData, ...over.data }),
    loadProposalState: async () => {
      log.push('load_state');
      return { ...baseState(), ...over.state };
    },
    insertCandidateRoutine: async (_userId, period, steps) => {
      log.push('insert_candidate');
      const id = `cccccccc-0000-4000-8000-00000000000${candidates.length + 1}`;
      candidates.push({ id, period, steps });
      return { id };
    },
    saveSummary: async (_threadId, summary) => {
      log.push('save_summary');
      summaries.push(summary);
    },
    getMessageBlock: async (userId, threadId, messageId, blockId) =>
      (userId === UID && threadId === THREAD && messageId === 'aaaaaaaa-0000-4000-8000-0000000000a1' && over.blocks?.[blockId]) || null,
    applyAction: async (p) => {
      actions.push(p);
      return over.apply ?? { result: 'applied', effect: { routine_id: 'x' } };
    },
  };
  return { db, log, messages, candidates, threads, summaries, actions };
}
