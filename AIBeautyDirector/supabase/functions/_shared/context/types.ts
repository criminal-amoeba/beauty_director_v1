// Raw rows the chat function loads for one user (ChatDb.loadContextData) and the pack buildContext makes of them.
import type { Metric } from '../codes.ts';

export type ContextData = {
  profile: { display_name: string | null; birth_date: string | null; goals: string[]; routine_level: string | null; budget: string | null; textures: string[] };
  settings: { persona: string; locale: string; timezone: string };
  reactions: { id: string; product_id: string | null; ingredient: string | null; reaction: string; severity: string; noted_at: string }[]; // resolved_at is null
  products: { id: string; name: string; brand: string | null; category: string; status: string; use_time: string; key_actives: string[]; ingredients_text: string | null; opened_at: string | null }[]; // active + paused
  routines: { id: string; period: 'am' | 'pm'; version: number | null; steps: { position: number; step_type: string; name: string | null; product_id: string | null }[] }[]; // active only
  scans: { id: string; completed_at: string; provider: string; provider_model_version: string | null; capture_protocol_version: string; metrics: Metric[] }[]; // ≤ 4 succeeded, newest first
  completions: { period: 'am' | 'pm'; local_date: string }[]; // last 30 local days
  changes: { entity: string; field: string | null; old_value: unknown; new_value: unknown; source: string; created_at: string }[]; // ≤ 20, newest first
  summary: string | null;
  messages: { role: 'user' | 'assistant'; content: string; created_at: string }[]; // ≤ 10, oldest first
};

// Priority order: when over budget, sections are dropped from the end; the first three never are.
export const SECTION_ORDER = ['facts', 'reactions', 'profile', 'routine', 'products', 'scans', 'adherence', 'changes', 'summary', 'last_replies', 'messages'] as const;
export type SectionName = (typeof SECTION_ORDER)[number];
export const NEVER_DROPPED: readonly SectionName[] = ['facts', 'reactions', 'profile'];

export type Sections = Partial<Record<SectionName, unknown>>;
export type ContextPack = { sections: Sections; dropped: SectionName[]; estimatedTokens: number };
export type ContextOpts = {
  now: number;
  today: string; // the user's local date (YYYY-MM-DD) for adherence windows
  budgetTokens?: number; // whole prompt, default 6000
  reservedTokens?: number; // system prompt + reply instructions, default 1200
};
