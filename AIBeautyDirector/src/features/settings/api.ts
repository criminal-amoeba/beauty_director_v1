import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { PERSONAS } from '@/features/onboarding/codes';
import { DataError } from '@/features/routine/api';
import { useAuth } from '@/lib/auth-context';
import { syncReminders } from '@/lib/notifications';
import { useHome } from '@/features/routine/hooks';
import type { Settings } from './schema';

export { settingsSchema, type Settings } from './schema';

const COLUMNS = 'persona, am_reminder_enabled, am_reminder_time, pm_reminder_enabled, pm_reminder_time, scan_reminder_enabled';
export const settingsKey = (userId: string) => ['settings', userId] as const;

export async function loadSettings(userId: string): Promise<Settings> {
  const res = await supabase.from('user_settings').select(COLUMNS).eq('user_id', userId).single();
  if (res.error || !res.data) throw new DataError(res.status === 0, res.error?.code);
  const r = res.data;
  return {
    persona: (PERSONAS as readonly string[]).includes(r.persona) ? (r.persona as Settings['persona']) : 'gentle',
    am_reminder_enabled: r.am_reminder_enabled,
    am_reminder_time: r.am_reminder_time.slice(0, 5), // Postgres time comes back as HH:mm:ss
    pm_reminder_enabled: r.pm_reminder_enabled,
    pm_reminder_time: r.pm_reminder_time.slice(0, 5),
    scan_reminder_enabled: r.scan_reminder_enabled,
  };
}

export async function saveSettings(userId: string, patch: Partial<Settings>): Promise<void> {
  const res = await supabase.from('user_settings').update(patch).eq('user_id', userId);
  if (res.error) throw new DataError(res.status === 0, res.error.code);
}

export function useSettings() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const query = useQuery({ queryKey: settingsKey(userId), queryFn: () => loadSettings(userId), enabled: !!userId });
  return { ...query, userId };
}

export function useSaveSettings(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => saveSettings(userId, patch),
    onSuccess: (_r, patch) => client.setQueryData<Settings>(settingsKey(userId), (s) => s && { ...s, ...patch }),
  });
}

// Mounted once in the (app) layout: reschedules local reminders on start and whenever the saved reminder
// settings, the last scan or the language change (persona changes don't reschedule).
export function useReminderSync() {
  const { i18n } = useTranslation();
  const { data: s } = useSettings();
  const { data: home } = useHome();
  const ready = !!s && !!home;
  const lastScanAt = home?.lastScanAt ?? null;
  const amOn = s?.am_reminder_enabled ?? false;
  const amAt = s?.am_reminder_time ?? '';
  const pmOn = s?.pm_reminder_enabled ?? false;
  const pmAt = s?.pm_reminder_time ?? '';
  const scanOn = s?.scan_reminder_enabled ?? false;
  const language = i18n.language;
  useEffect(() => {
    if (!ready) return;
    const settings = { am_reminder_enabled: amOn, am_reminder_time: amAt, pm_reminder_enabled: pmOn, pm_reminder_time: pmAt, scan_reminder_enabled: scanOn };
    syncReminders(settings, lastScanAt).catch((e) => console.warn('reminders not scheduled', e?.code ?? e?.name));
  }, [ready, amOn, amAt, pmOn, pmAt, scanOn, lastScanAt, language]);
}
