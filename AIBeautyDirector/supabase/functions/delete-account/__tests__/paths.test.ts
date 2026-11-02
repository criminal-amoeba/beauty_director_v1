/** @jest-environment node */
import { listFiles, type Entry } from '../paths';

const tree: Record<string, Entry[]> = {
  u: [{ name: 'a.jpg', id: '1' }, { name: 'old', id: null }],
  'u/old': [{ name: 'b.jpg', id: '2' }, { name: 'deeper', id: null }],
  'u/old/deeper': [{ name: 'c.jpg', id: '3' }],
};

describe('listFiles', () => {
  it('collects files in sub-folders too', async () => {
    expect(await listFiles(async (p) => tree[p] ?? [], 'u')).toEqual(['u/a.jpg', 'u/old/b.jpg', 'u/old/deeper/c.jpg']);
  });
  it('returns nothing for an empty folder', async () => {
    expect(await listFiles(async () => [], 'u')).toEqual([]);
  });
});
