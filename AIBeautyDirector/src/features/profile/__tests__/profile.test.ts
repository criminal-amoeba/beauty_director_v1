import type { ReactionAnswer } from '@/features/onboarding/api';
import { settingsSchema } from '@/features/settings/schema';
import { diffReactions } from '../reactions';
import { identitiesOf } from '../identities-of';

const r = (ingredient: ReactionAnswer['ingredient'], reaction: ReactionAnswer['reaction'] = 'redness', severity: ReactionAnswer['severity'] = 'mild'): ReactionAnswer =>
  ({ ingredient, reaction, severity });

describe('diffReactions', () => {
  it('keeps unchanged rows, resolves removed or changed ones, inserts new ones', () => {
    const saved = [r('fragrance'), r('alcohol', 'stinging', 'moderate'), r('retinoids')];
    const next = [r('fragrance'), r('alcohol', 'stinging', 'severe'), r('vitamin_c')];
    expect(diffReactions(saved, next)).toEqual({
      insert: [r('alcohol', 'stinging', 'severe'), r('vitamin_c')],
      resolve: ['alcohol', 'retinoids'],
    });
  });
  it('is a no-op for identical lists', () => {
    expect(diffReactions([r('fragrance')], [r('fragrance')])).toEqual({ insert: [], resolve: [] });
  });
});

describe('identitiesOf', () => {
  it('reads providers from identities and app_metadata', () => {
    expect(identitiesOf(null)).toEqual({ email: null, phone: null, line: false });
    expect(identitiesOf({ email: 'a@b.c', phone: '', identities: [{ provider: 'email' }] as never, app_metadata: { providers: ['email', 'custom:line'] } }))
      .toEqual({ email: 'a@b.c', phone: null, line: true });
    expect(identitiesOf({ email: 'x@y.z', phone: '886912345678', identities: [{ provider: 'phone' }] as never, app_metadata: {} }))
      .toEqual({ email: null, phone: '886912345678', line: false });
  });
});

describe('settingsSchema', () => {
  const base = { persona: 'gentle', am_reminder_enabled: true, am_reminder_time: '08:00', pm_reminder_enabled: false, pm_reminder_time: '21:30', scan_reminder_enabled: false };
  it('accepts HH:mm and rejects other times or personas', () => {
    expect(settingsSchema.safeParse(base).success).toBe(true);
    expect(settingsSchema.safeParse({ ...base, am_reminder_time: '8:00' }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, pm_reminder_time: '24:00' }).success).toBe(false);
    expect(settingsSchema.safeParse({ ...base, persona: 'sassy' }).success).toBe(false);
  });
});
