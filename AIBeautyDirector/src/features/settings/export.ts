import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';

export type ExportErrorKey = 'settings.exportErrors.offline' | 'settings.exportErrors.rateLimited' | 'settings.exportErrors.failed';

// Fetches the export from the export-data function, writes it to the cache and opens the share sheet.
// The file is removed from the cache once the sheet closes. Resolves null on success, else an i18n key.
export async function exportMyData(dialogTitle: string): Promise<ExportErrorKey | null> {
  const { data, error } = await supabase.functions.invoke('export-data', { method: 'POST', timeout: 60_000 });
  if (error) {
    if (error instanceof FunctionsFetchError) return 'settings.exportErrors.offline';
    if (error instanceof FunctionsHttpError && error.context instanceof Response && error.context.status === 429) return 'settings.exportErrors.rateLimited';
    return 'settings.exportErrors.failed';
  }
  if (!(await Sharing.isAvailableAsync())) return 'settings.exportErrors.failed';
  const file = new File(Paths.cache, `beauty-director-export-${new Date().toISOString().slice(0, 10)}.json`);
  try {
    if (file.exists) file.delete();
    file.write(JSON.stringify(data, null, 2));
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle, UTI: 'public.json' });
    return null;
  } catch {
    return 'settings.exportErrors.failed';
  } finally {
    try { file.delete(); } catch { /* already gone */ }
  }
}
