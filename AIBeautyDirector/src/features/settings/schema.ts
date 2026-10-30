import { z } from 'zod';
import { PERSONAS } from '@/features/onboarding/codes';

// user_settings as the Settings screen edits them (locale is handled by the language switch, timezone by Home).
export const settingsSchema = z.object({
  persona: z.enum(PERSONAS),
  am_reminder_enabled: z.boolean(),
  am_reminder_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'settings.validation.time'),
  pm_reminder_enabled: z.boolean(),
  pm_reminder_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'settings.validation.time'),
  scan_reminder_enabled: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;
