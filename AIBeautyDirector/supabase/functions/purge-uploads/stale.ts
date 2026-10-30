// Scan photos live at {user_id}/{file} and are deleted by the scan in every path; anything older than this
// is an upload whose scan request never arrived (app killed mid-upload, network drop).
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PLACEHOLDER = '.emptyFolderPlaceholder';

export type StoredFile = { name: string; id: string | null; created_at: string | null };

export const stalePaths = (folder: string, files: StoredFile[], now: number): string[] =>
  files
    .filter((f) => f.id !== null && f.name !== PLACEHOLDER && f.created_at !== null && now - Date.parse(f.created_at) > MAX_AGE_MS)
    .map((f) => `${folder}/${f.name}`);
