import { deviceStorage } from '../storage';

// jest.mock is hoisted above the import.
const mockMem = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockMem.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    if (new TextEncoder().encode(v).length > 2048) throw new Error(`chunk too large: ${k}`);
    mockMem.set(k, v);
  },
  deleteItemAsync: async (k: string) => { mockMem.delete(k); },
}));

describe('chunked SecureStore', () => {
  beforeEach(() => mockMem.clear());

  it('round-trips a session-sized value and CJK text without exceeding 2048 bytes per key', async () => {
    const big = 'x'.repeat(5000) + '保養'.repeat(800);
    await deviceStorage.setItem('sb-auth', big);
    expect(await deviceStorage.getItem('sb-auth')).toBe(big);
  });

  it('removes leftover chunks when a value shrinks, and everything on remove', async () => {
    await deviceStorage.setItem('k', 'a'.repeat(3000));
    await deviceStorage.setItem('k', 'short');
    expect(await deviceStorage.getItem('k')).toBe('short');
    expect([...mockMem.keys()].sort()).toEqual(['k.0', 'k.n']);
    await deviceStorage.removeItem('k');
    expect(mockMem.size).toBe(0);
    expect(await deviceStorage.getItem('k')).toBeNull();
  });

  it('round-trips an empty string and returns null for a missing key or a lost chunk', async () => {
    await deviceStorage.setItem('e', '');
    expect(await deviceStorage.getItem('e')).toBe('');
    expect(await deviceStorage.getItem('missing')).toBeNull();
    await deviceStorage.setItem('c', 'b'.repeat(1500));
    mockMem.delete('c.1');
    expect(await deviceStorage.getItem('c')).toBeNull();
  });
});
