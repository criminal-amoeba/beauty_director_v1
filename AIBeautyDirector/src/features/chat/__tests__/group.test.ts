import { GROUP_GAP_MS, groupFlags } from '../group';

const at = (role: string, minute: number) => ({ role, created_at: new Date(Date.UTC(2026, 9, 30, 12, minute)).toISOString() });

describe('groupFlags', () => {
  it('groups consecutive messages of one role sent within five minutes', () => {
    expect(groupFlags([at('assistant', 0), at('assistant', 2), at('assistant', 4)])).toEqual([
      { first: true, last: false }, { first: false, last: false }, { first: false, last: true },
    ]);
  });

  it('splits on a role change', () => {
    expect(groupFlags([at('user', 0), at('assistant', 1), at('user', 2)])).toEqual([
      { first: true, last: true }, { first: true, last: true }, { first: true, last: true },
    ]);
  });

  it('splits on a gap longer than the group window', () => {
    expect(GROUP_GAP_MS).toBe(5 * 60_000);
    expect(groupFlags([at('assistant', 0), at('assistant', 6)])).toEqual([{ first: true, last: true }, { first: true, last: true }]);
    expect(groupFlags([])).toEqual([]);
  });
});
