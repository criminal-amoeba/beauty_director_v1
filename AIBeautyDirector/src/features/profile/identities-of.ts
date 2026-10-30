import type { User } from '@supabase/supabase-js';
import { LINE_PROVIDER } from '@/lib/guard';

export type Identities = { email: string | null; phone: string | null; line: boolean };

// Which sign-in methods the account already has (from the session user, no extra request).
export function identitiesOf(user: Pick<User, 'email' | 'phone' | 'identities' | 'app_metadata'> | null | undefined): Identities {
  const providers = new Set([...(user?.identities?.map((i) => i.provider) ?? []), ...((user?.app_metadata?.providers as string[] | undefined) ?? [])]);
  return {
    email: providers.has('email') && user?.email ? user.email : null,
    phone: providers.has('phone') && user?.phone ? user.phone : null,
    line: providers.has(LINE_PROVIDER),
  };
}
