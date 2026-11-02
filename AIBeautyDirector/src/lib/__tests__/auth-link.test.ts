import { parseAuthCallback, resendWaitSeconds } from '../auth-link';

describe('parseAuthCallback', () => {
  it('reads the PKCE code from the query (Expo Go and app scheme)', () => {
    const code = { type: 'code', authCode: 'c0de-1' };
    expect(parseAuthCallback('exp://192.168.1.5:8081/--/verify?code=c0de-1')).toEqual(code);
    expect(parseAuthCallback('aibeautydirector://verify?code=c0de-1')).toEqual(code);
  });

  it('ignores implicit-flow tokens, so a crafted link cannot sign anyone in', () => {
    expect(parseAuthCallback('aibeautydirector://verify#access_token=a.b.c&refresh_token=r1&type=recovery')).toBeNull();
  });

  it('reads errors from the fragment or the query', () => {
    expect(
      parseAuthCallback('aibeautydirector://verify#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'),
    ).toEqual({ type: 'error', code: 'otp_expired' });
    expect(parseAuthCallback('aibeautydirector://verify?error=server_error')).toEqual({ type: 'error', code: 'server_error' });
    expect(parseAuthCallback('aibeautydirector://verify?error=access_denied&code=x')).toEqual({ type: 'error', code: 'access_denied' });
  });

  it('ignores ordinary deep links and missing URLs', () => {
    expect(parseAuthCallback('aibeautydirector://verify')).toBeNull();
    expect(parseAuthCallback('exp://192.168.1.5:8081')).toBeNull();
    expect(parseAuthCallback('aibeautydirector://verify#access_token=only')).toBeNull();
    expect(parseAuthCallback(null)).toBeNull();
  });
});

describe('resendWaitSeconds', () => {
  const t0 = 1_000_000;
  it('counts down two minutes from the last send, never below zero', () => {
    expect(resendWaitSeconds(t0, t0)).toBe(120);
    expect(resendWaitSeconds(t0, t0 + 17_400)).toBe(103);
    expect(resendWaitSeconds(t0, t0 + 120_000)).toBe(0);
    expect(resendWaitSeconds(t0, t0 + 999_999)).toBe(0);
  });

  it('allows an immediate resend when nothing was sent from this device', () => {
    expect(resendWaitSeconds(0, t0)).toBe(0);
  });
});
