/** @jest-environment node */
import { MAX_AGE_MS, stalePaths } from '../stale';

const now = Date.parse('2026-10-31T00:00:00Z');
const at = (msAgo: number) => new Date(now - msAgo).toISOString();

describe('stalePaths', () => {
  it('keeps recent uploads, folders and the placeholder; returns old files', () => {
    expect(stalePaths('u', [
      { name: 'old.jpg', id: '1', created_at: at(MAX_AGE_MS + 1) },
      { name: 'new.jpg', id: '2', created_at: at(60_000) },
      { name: 'sub', id: null, created_at: null },
      { name: '.emptyFolderPlaceholder', id: '3', created_at: at(MAX_AGE_MS * 10) },
    ], now)).toEqual(['u/old.jpg']);
  });
});
