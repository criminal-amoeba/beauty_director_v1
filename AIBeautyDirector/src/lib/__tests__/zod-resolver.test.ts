import { emptyIdentity, signUpSchema } from '@/features/auth/schemas';
import { zodResolver } from '../zod-resolver';

const resolve = zodResolver(signUpSchema);
const options = { fields: {}, shouldUseNativeValidation: false } as Parameters<typeof resolve>[2];

describe('zodResolver', () => {
  it('returns nested, first-per-field errors for an empty sign-up form', async () => {
    const r = await resolve({ ...emptyIdentity, password: '', confirm: '' }, undefined, options);
    expect(r.values).toEqual({});
    expect(r.errors).toEqual({
      email: { type: 'custom', message: 'auth.validation.required' },
      password: { type: 'custom', message: 'auth.validation.passwordShort' },
    });
  });

  it('nests phone errors under phone.national', async () => {
    const r = await resolve(
      { ...emptyIdentity, method: 'phone', phone: { country: 'TW', national: '12' }, password: 'longenough1', confirm: 'nope' },
      undefined,
      options,
    );
    expect(r.errors).toEqual({
      phone: { national: { type: 'custom', message: 'auth.validation.phone' } },
      confirm: { type: 'custom', message: 'auth.validation.mismatch' },
    });
  });

  it('returns the transformed output on success', async () => {
    const r = await resolve({ ...emptyIdentity, email: 'A@B.co', password: 'longenough1', confirm: 'longenough1' }, undefined, options);
    expect(r).toEqual({ values: { method: 'email', id: 'a@b.co', password: 'longenough1' }, errors: {} });
  });
});
