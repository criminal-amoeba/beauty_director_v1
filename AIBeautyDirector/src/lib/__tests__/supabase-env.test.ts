describe('supabase client env', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.resetModules();
  });

  it('fails loudly when a public env var is missing, instead of falling back to ""', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => jest.requireActual('../supabase')).toThrow(/EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it('creates the client when both are set', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    expect(jest.requireActual('../supabase').supabase.auth).toBeDefined();
  });
});
