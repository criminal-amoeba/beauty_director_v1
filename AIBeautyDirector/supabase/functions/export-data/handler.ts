// Builds the caller's data export: one JSON document, one array per table. Explicit column lists, so an
// internal column added later (busy_until, image_path, token counts…) never leaks by default. user_id is
// left out of every row (the whole file is one user's). Pure: index.ts supplies the DB reads.

export const FORMAT_VERSION = 1;

export const EXPORT_TABLES = {
  profiles: 'display_name, birth_date, gender, onboarding_completed, created_at, updated_at',
  user_settings: 'persona, locale, timezone, am_reminder_enabled, am_reminder_time, pm_reminder_enabled, pm_reminder_time, scan_reminder_enabled, created_at, updated_at',
  skin_profiles: 'goals, routine_level, budget, textures, created_at, updated_at',
  consents: 'purpose, granted, policy_version, created_at',
  user_products: 'id, name, brand, category, status, use_time, key_actives, ingredients_text, notes, opened_at, created_at, updated_at',
  product_reactions: 'id, product_id, ingredient, reaction, severity, noted_at, resolved_at, created_at',
  routines: 'id, period, is_active, version, source, supersedes_routine_id, created_at, updated_at',
  routine_steps: 'id, routine_id, position, step_type, name, product_id, created_at, updated_at',
  routine_completions: 'routine_id, period, local_date, completed_step_ids, skipped_step_ids, created_at',
  daily_checkins: 'local_date, dryness, stinging, oiliness, created_at, updated_at',
  scans: 'id, status, provider, provider_model_version, capture_protocol_version, provider_raw, failure_code, created_at, completed_at',
  scan_metrics: 'scan_id, metric_code, value, metric_definition_version, created_at',
  chat_threads: 'id, origin, title, scan_id, summary, last_message_at, created_at',
  chat_messages: 'id, thread_id, role, content, blocks, model, created_at',
  chat_actions: 'thread_id, message_id, block_id, action, result, created_at',
  profile_change_events: 'entity, row_id, field, old_value, new_value, source, created_at',
} as const;
export type ExportTable = keyof typeof EXPORT_TABLES;

// Every read must be scoped to userId (the function runs with the service role, which bypasses RLS).
export type ExportDb = { rows(table: ExportTable, columns: string, userId: string): Promise<Record<string, unknown>[]> };
export type ExportUser = { id: string; email?: string | null; phone?: string | null; created_at: string; providers: string[] };

const LEGEND = 'Option values are stable English codes (for example persona "gentle", purpose "photo_analysis"). '
  + 'Timestamps are ISO 8601 in UTC; local_date is the routine day in your time zone. '
  + 'Photos are not included: each one is deleted right after its analysis. Scores are 0-100 appearance estimates, not medical measurements.';

export async function buildExport(db: ExportDb, user: ExportUser, now: Date) {
  const tables = {} as Record<ExportTable, Record<string, unknown>[]>;
  for (const table of Object.keys(EXPORT_TABLES) as ExportTable[]) {
    tables[table] = await db.rows(table, EXPORT_TABLES[table], user.id);
  }
  return {
    format_version: FORMAT_VERSION,
    exported_at: now.toISOString(),
    legend: LEGEND,
    account: { email: user.email ?? null, phone: user.phone ?? null, created_at: user.created_at, sign_in_methods: user.providers },
    ...tables,
  };
}

// shortcut: per-instance memory, so the limit is per Edge Function instance (cold starts reset it). Exports are
// read-only and scoped to the caller; move to a table if they ever get expensive.
export const EXPORTS_PER_HOUR = 3;
export function makeRateLimiter(limit = EXPORTS_PER_HOUR, windowMs = 3_600_000) {
  const hits = new Map<string, number[]>();
  return (userId: string, now: number) => {
    const recent = (hits.get(userId) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) return false;
    hits.set(userId, [...recent, now]);
    return true;
  };
}
