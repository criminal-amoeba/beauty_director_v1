import { POLICY_VERSION, type Purpose } from '@/features/onboarding/codes';

export type ConsentState = { granted: boolean; policy_version: string; created_at: string };
export type Consents = Partial<Record<Purpose, ConsentState>>;
export type ConsentRow = { purpose: Purpose; granted: boolean; policy_version: string };

// Terms can't be withdrawn here (that is what delete account is for); an unchanged choice writes nothing,
// so the append-only log holds one row per real change.
export function consentChange(saved: Consents, purpose: Purpose, granted: boolean): ConsentRow | null {
  if (purpose === 'terms') return null;
  if ((saved[purpose]?.granted ?? false) === granted) return null;
  return { purpose, granted, policy_version: POLICY_VERSION };
}
