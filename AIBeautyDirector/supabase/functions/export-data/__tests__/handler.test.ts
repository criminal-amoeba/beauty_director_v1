/** @jest-environment node */
import { buildExport, EXPORT_TABLES, makeRateLimiter, type ExportDb, type ExportTable } from '../handler';

const UID = 'aaaaaaaa-0000-4000-8000-000000000001';
const user = { id: UID, email: null, phone: '886912345678', created_at: '2026-10-01T00:00:00Z', providers: ['phone'] };

function fakeDb() {
  const calls: { table: ExportTable; columns: string; userId: string }[] = [];
  const db: ExportDb = {
    async rows(table, columns, userId) {
      calls.push({ table, columns, userId });
      return table === 'consents' ? [{ purpose: 'terms', granted: true, policy_version: '2026-10-30', created_at: 'x' }] : [];
    },
  };
  return { db, calls };
}

describe('buildExport', () => {
  it('reads every table, each scoped to the caller', async () => {
    const { db, calls } = fakeDb();
    const out = await buildExport(db, user, new Date('2026-10-30T00:00:00Z'));
    expect(calls.map((c) => c.table).sort()).toEqual(Object.keys(EXPORT_TABLES).sort());
    expect(calls.every((c) => c.userId === UID)).toBe(true);
    for (const t of Object.keys(EXPORT_TABLES)) expect(out).toHaveProperty(t);
    expect(out.consents).toHaveLength(1);
    expect(out).toMatchObject({ format_version: 1, exported_at: '2026-10-30T00:00:00.000Z', account: { phone: '886912345678', sign_in_methods: ['phone'] } });
  });

  it('never selects internal or cross-user columns', () => {
    const columns = Object.values(EXPORT_TABLES).join(',').split(',').map((c) => c.trim());
    for (const c of ['user_id', 'busy_until', 'image_path', 'provider_job_id', 'prompt_tokens', 'completion_tokens', 'summary_through_message_id']) {
      expect(columns).not.toContain(c);
    }
  });
});

describe('makeRateLimiter', () => {
  it('allows 3 per hour per user', () => {
    const allow = makeRateLimiter();
    expect([0, 1, 2, 3].map((i) => allow(UID, i))).toEqual([true, true, true, false]);
    expect(allow('other', 4)).toBe(true);
    expect(allow(UID, 3_600_001)).toBe(true);
  });
});
