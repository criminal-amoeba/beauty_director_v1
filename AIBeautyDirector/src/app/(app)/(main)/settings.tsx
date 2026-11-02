import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, Download, LogOut, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Checkbox, ErrorState, Input, PressableScale, Screen, Sheet, Skeleton, Text } from '@/components/ui';
import { FormBanner } from '@/components/AuthFields';
import { AppearanceSwitch } from '@/components/AppearanceSwitch';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import type { AuthErrorKey } from '@/features/auth/schemas';
import { PERSONAS } from '@/features/onboarding/codes';
import { isOffline } from '@/features/routine/api';
import { settingsSchema, useSaveSettings, useSettings, type Settings } from '@/features/settings/api';
import { exportMyData, type ExportErrorKey } from '@/features/settings/export';
import { useAuth } from '@/lib/auth-context';
import { requestNotifications } from '@/lib/notifications';
import { useTheme } from '@/theme/useTheme';

// Persona (tone only), reminders (local notifications), language, appearance, data, account.
export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, space, radii } = useTheme();
  const { signOut, deleteAccount } = useAuth();
  const { data, error, isPending, refetch, isRefetching, userId } = useSettings();
  const save = useSaveSettings(userId);
  const [draft, setDraft] = useState<Settings | null>(null);
  const form = draft ?? data ?? null; // edits live in draft; until the first edit the server values show
  const [timeError, setTimeError] = useState<Partial<Record<'am_reminder_time' | 'pm_reminder_time', string>>>({});
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<AuthErrorKey | null>(null);
  const [blocked, setBlocked] = useState(false); // notifications denied in the OS settings
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<ExportErrorKey | null>(null);
  const runExport = async () => {
    setExporting(true);
    setExportError(await exportMyData(t('settings.export')));
    setExporting(false);
  };

  type Toggle = 'am_reminder_enabled' | 'pm_reminder_enabled' | 'scan_reminder_enabled';
  // Permission is asked only when a reminder is turned on; if denied, the box stays off.
  const toggle = async (field: Toggle, on: boolean) => {
    if (!form) return;
    if (on && !(await requestNotifications())) return setBlocked(true);
    setBlocked(false);
    setDraft({ ...form, [field]: on });
  };

  const remove = async () => {
    setDeleting(true);
    setDeleteError(await deleteAccount());
    setDeleting(false);
  };
  const close = () => {
    if (deleting) return;
    setConfirming(false);
    setDeleteError(null);
  };
  const setPersona = (persona: Settings['persona']) => {
    if (form) setDraft({ ...form, persona });
    save.mutate({ persona });
  };
  const saveReminders = () => {
    if (!form) return;
    const r = settingsSchema.safeParse(form);
    if (!r.success) {
      const next: typeof timeError = {};
      for (const i of r.error.issues) if (i.path[0] === 'am_reminder_time' || i.path[0] === 'pm_reminder_time') next[i.path[0]] = t('settings.validation.time');
      return setTimeError(next);
    }
    setTimeError({});
    const { persona: _p, ...reminders } = r.data;
    save.mutate(reminders);
  };

  return (
    <Screen edges={['bottom']}>
      <Text variant="display">{t('settings.title')}</Text>

      <Card>
        <Text variant="h2">{t('settings.persona')}</Text>
        <Text variant="caption" color="textMuted">{t('settings.personaHelper')}</Text>
        {isPending || !form ? <Skeleton height={space.xxxl} /> : error ? (
          <ErrorState offline={isOffline(error)} onRetry={() => refetch()} retrying={isRefetching} retryLabel={t('common.retry')} />
        ) : (
          PERSONAS.map((p) => {
            const on = form.persona === p;
            return (
              <PressableScale
                key={p}
                onPress={() => setPersona(p)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t(`codes.persona.${p}.name`)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radii.sm, borderWidth: on ? 2 : 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.surface }}>
                <View style={{ flex: 1, gap: space.xs }}>
                  <Text variant="label">{t(`codes.persona.${p}.name`)}</Text>
                  <Text variant="caption" color="textMuted">{t(`codes.persona.${p}.description`)}</Text>
                </View>
                {on && <Check size={20} color={colors.primary} />}
              </PressableScale>
            );
          })
        )}
      </Card>

      {form && !error && (
        <Card>
          <Text variant="h2">{t('settings.reminders')}</Text>
          <Text variant="caption" color="textMuted">{t('settings.remindersHelper')}</Text>
          <Checkbox label={t('settings.amReminder')} checked={form.am_reminder_enabled} onChange={(v) => toggle('am_reminder_enabled', v)} />
          {form.am_reminder_enabled && (
            <Input label={t('settings.time')} placeholder="08:00" value={form.am_reminder_time} onChangeText={(v) => setDraft({ ...form, am_reminder_time: v })} keyboardType="numbers-and-punctuation" maxLength={5} error={timeError.am_reminder_time} />
          )}
          <Checkbox label={t('settings.pmReminder')} checked={form.pm_reminder_enabled} onChange={(v) => toggle('pm_reminder_enabled', v)} />
          {form.pm_reminder_enabled && (
            <Input label={t('settings.time')} placeholder="21:30" value={form.pm_reminder_time} onChangeText={(v) => setDraft({ ...form, pm_reminder_time: v })} keyboardType="numbers-and-punctuation" maxLength={5} error={timeError.pm_reminder_time} />
          )}
          <Checkbox label={t('settings.scanReminder')} checked={form.scan_reminder_enabled} onChange={(v) => toggle('scan_reminder_enabled', v)} />
          {blocked && (
            <View style={{ gap: space.xs }}>
              <Text variant="caption" color="textMuted">{t('settings.remindersBlocked')}</Text>
              <Button title={t('settings.openSettings')} variant="ghost" onPress={() => Linking.openSettings()} />
            </View>
          )}
          {save.error && <Text variant="caption" color="danger">{t(isOffline(save.error) ? 'auth.errors.network' : 'auth.errors.generic')}</Text>}
          <Button title={t('settings.save')} variant="secondary" onPress={saveReminders} loading={save.isPending && !('persona' in (save.variables ?? {}))} />
        </Card>
      )}

      <Card>
        <Text variant="h2">{t('settings.language')}</Text>
        <LanguageSwitch />
      </Card>

      <Card>
        <Text variant="h2">{t('settings.appearance')}</Text>
        <AppearanceSwitch />
      </Card>

      <Card>
        <Text variant="h2">{t('settings.data')}</Text>
        <Button title={t('privacy.title')} icon={ShieldCheck} variant="ghost" onPress={() => router.push('/privacy')} />
        <Button title={t('settings.export')} icon={Download} variant="ghost" onPress={runExport} loading={exporting} />
        <Text variant="caption" color={exportError ? 'danger' : 'textMuted'}>{t(exportError ?? 'settings.exportHelper')}</Text>
      </Card>

      <Card>
        <Text variant="h2">{t('settings.account')}</Text>
        <View style={{ gap: space.sm }}>
          <Button title={t('common.signOut')} icon={LogOut} variant="secondary" onPress={signOut} />
          <Button title={t('settings.delete')} icon={Trash2} variant="ghost" onPress={() => setConfirming(true)} />
        </View>
      </Card>
      <Sheet visible={confirming} onClose={close} title={t('settings.deleteTitle')} closeLabel={t('common.close')}>
        <Text>{t('settings.deleteMessage')}</Text>
        <FormBanner error={deleteError} />
        <View style={{ gap: space.sm }}>
          <Button title={t('settings.deleteConfirm')} variant="danger" onPress={remove} loading={deleting} />
          <Button title={t('settings.cancel')} variant="ghost" onPress={close} disabled={deleting} />
        </View>
      </Sheet>
    </Screen>
  );
}
