import type { TFunction } from 'i18next';
import {
  BUDGETS, GOALS, INGREDIENTS, isOneOf, KEY_ACTIVES, LEVELS, PRODUCT_STATUSES, REACTIONS, SEVERITIES, TEXTURES, USE_TIMES,
} from '@/features/onboarding/codes';

// A confirm_change card's text, built in the app from the stored change (entity, field, new_value) so it follows
// the language on screen. The server's English `label` is shown only for a change this function does not know,
// e.g. a field added on the server before the app learns it. Field list = CHANGE_FIELDS in the chat function.
export type ChangeBlock = { entity: string; field: string; row_id: string | null; new_value: unknown; label: string };

type Codes<C extends string> = { codes: readonly C[]; label: (c: C) => string };

export function changeLabel(b: ChangeBlock, t: TFunction, productName: (id: string) => string | undefined): string {
  const one = <C extends string>(c: Codes<C>, v: unknown) => (isOneOf(c.codes, v) ? c.label(v) : null);
  const many = <C extends string>(c: Codes<C>, v: unknown) =>
    Array.isArray(v) && v.length > 0 && v.every((x) => isOneOf(c.codes, x)) ? v.map((x) => c.label(x as C)).join(t('chat.blocks.change.separator')) : null;

  const goal: Codes<(typeof GOALS)[number]> = { codes: GOALS, label: (c) => t(`codes.goal.${c}`) };
  const level: Codes<(typeof LEVELS)[number]> = { codes: LEVELS, label: (c) => t(`codes.level.${c}`) };
  const budget: Codes<(typeof BUDGETS)[number]> = { codes: BUDGETS, label: (c) => t(`codes.budget.${c}`) };
  const texture: Codes<(typeof TEXTURES)[number]> = { codes: TEXTURES, label: (c) => t(`codes.texture.${c}`) };
  const status: Codes<(typeof PRODUCT_STATUSES)[number]> = { codes: PRODUCT_STATUSES, label: (c) => t(`codes.productStatus.${c}`) };
  const useTime: Codes<(typeof USE_TIMES)[number]> = { codes: USE_TIMES, label: (c) => t(`codes.useTime.${c}`) };
  const active: Codes<(typeof KEY_ACTIVES)[number]> = { codes: KEY_ACTIVES, label: (c) => t(`codes.actives.${c}`) };
  const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

  const field = (f: 'goals' | 'routine_level' | 'budget' | 'textures' | 'status' | 'use_time' | 'key_actives' | 'opened_at', value: string | null) =>
    value === null ? null : { field: t(`chat.blocks.fields.${f}`), value };

  let out: string | null = null;
  if (b.entity === 'skin_profile') {
    const f = b.field === 'goals' ? field('goals', many(goal, b.new_value))
      : b.field === 'routine_level' ? field('routine_level', one(level, b.new_value))
      : b.field === 'budget' ? field('budget', one(budget, b.new_value))
      : b.field === 'textures' ? field('textures', many(texture, b.new_value))
      : null;
    out = f && t('chat.blocks.change.field', f);
  } else if (b.entity === 'product') {
    const product = b.row_id ? productName(b.row_id) : undefined;
    const f = b.field === 'status' ? field('status', one(status, b.new_value))
      : b.field === 'use_time' ? field('use_time', one(useTime, b.new_value))
      : b.field === 'key_actives' ? field('key_actives', many(active, b.new_value))
      : b.field === 'opened_at' ? field('opened_at', date(b.new_value))
      : null;
    out = f && product ? t('chat.blocks.change.product', { ...f, product }) : null;
  } else if (b.entity === 'reaction' && b.field === 'resolved_at') {
    out = t('chat.blocks.change.resolved');
  } else if (b.entity === 'reaction' && b.field === 'new' && b.new_value && typeof b.new_value === 'object') {
    const v = b.new_value as { product_id?: unknown; ingredient?: unknown; reaction?: unknown; severity?: unknown };
    const reaction = isOneOf(REACTIONS, v.reaction) ? t(`codes.reaction.${v.reaction}`) : null;
    const severity = isOneOf(SEVERITIES, v.severity) ? t(`codes.severity.${v.severity}`) : null;
    // ingredient is free text in the DB: the app's own codes get a label, anything else is shown as typed
    const target = typeof v.product_id === 'string' ? productName(v.product_id)
      : isOneOf(INGREDIENTS, v.ingredient) ? t(`codes.ingredient.${v.ingredient}`)
      : typeof v.ingredient === 'string' && v.ingredient.trim() ? v.ingredient.trim()
      : undefined;
    out = reaction && severity && target ? t('chat.blocks.change.reaction', { reaction, severity, target }) : null;
  }
  return out ?? b.label;
}
