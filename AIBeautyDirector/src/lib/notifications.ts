import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { i18n } from '@/lib/i18n';
import { planReminders, type ReminderSettings } from './reminder-plan';

export type { ReminderSettings } from './reminder-plan';

// Local reminders, scheduled on the phone (no push server). This app schedules nothing else, so a sync
// cancels everything it scheduled and plans again from the saved settings.

const CHANNEL = 'reminders';
const supported = Platform.OS !== 'web';

// Foreground: show the banner too (a reminder that arrives while the app is open is still wanted).
if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export async function notificationsAllowed(): Promise<boolean> {
  if (!supported) return false;
  return (await Notifications.getPermissionsAsync()).granted;
}

// Asked only when the user turns a reminder on. false = denied (the OS won't ask again; offer "Open settings").
export async function requestNotifications(): Promise<boolean> {
  if (!supported) return false;
  if (await notificationsAllowed()) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function cancelReminders() {
  if (supported) await Notifications.cancelAllScheduledNotificationsAsync();
}

// Called whenever the saved settings, the last scan or the language change; text follows the on-screen language.
export async function syncReminders(s: ReminderSettings, lastScanAt: string | null) {
  if (!supported) return;
  await cancelReminders();
  if (!(await notificationsAllowed())) return;
  const t = i18n.t.bind(i18n);
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: t('notifications.channel'), importance: Notifications.AndroidImportance.DEFAULT });
  }
  for (const r of planReminders(s, lastScanAt, Date.now())) {
    await Notifications.scheduleNotificationAsync({
      identifier: `reminder-${r.kind}`,
      content: { title: t(`notifications.${r.kind}.title`), body: t(`notifications.${r.kind}.body`) },
      trigger: r.kind === 'scan'
        ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.date, channelId: CHANNEL }
        : { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: r.hour, minute: r.minute, channelId: CHANNEL },
    });
  }
}
