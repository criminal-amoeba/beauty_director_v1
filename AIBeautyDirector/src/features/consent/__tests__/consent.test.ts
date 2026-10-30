import { POLICY_VERSION } from '@/features/onboarding/codes';
import { consentChange, type Consents } from '../change';

const at = '2026-10-30T00:00:00Z';
const saved: Consents = {
  terms: { granted: true, policy_version: '2026-10-30', created_at: at },
  photo_analysis: { granted: true, policy_version: '2026-10-30', created_at: at },
};

describe('consentChange', () => {
  it('writes a row only when the choice changes', () => {
    expect(consentChange(saved, 'photo_analysis', true)).toBeNull();
    expect(consentChange(saved, 'photo_analysis', false)).toEqual({ purpose: 'photo_analysis', granted: false, policy_version: POLICY_VERSION });
  });

  it('treats a purpose never recorded as off', () => {
    expect(consentChange(saved, 'marketing', false)).toBeNull();
    expect(consentChange(saved, 'marketing', true)).toEqual({ purpose: 'marketing', granted: true, policy_version: POLICY_VERSION });
  });

  it('never withdraws Terms from this screen', () => {
    expect(consentChange(saved, 'terms', false)).toBeNull();
  });
});
