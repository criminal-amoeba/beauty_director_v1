// Storage lists one folder level at a time; folders come back with id null. Lister pages within a level.
export type Entry = { name: string; id: string | null };
export type Lister = (prefix: string) => Promise<Entry[]>;

// Every file path under prefix, sub-folders included.
export async function listFiles(list: Lister, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await list(prefix)) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id === null) out.push(...(await listFiles(list, path)));
    else out.push(path);
  }
  return out;
}
