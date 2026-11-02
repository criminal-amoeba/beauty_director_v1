import { useState } from 'react';
import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Button, Sheet, Text } from '@/components/ui';
import type { ReactionAnswer } from '@/features/onboarding/api';
import { INGREDIENTS, REACTIONS, SEVERITIES, type Ingredient } from '@/features/onboarding/codes';
import { useTheme } from '@/theme/useTheme';
import { ChipGroup, StepFooter, StepScroll, type StepProps } from './parts';

// Ingredient chips; details for one ingredient at a time go in a bottom sheet, so the screen stays short
// however many are picked. Only complete answers are kept, so Continue never waits on a half-filled one.
export function ReactionsStep({ initial, onSubmit, saving, error }: StepProps<ReactionAnswer[]>) {
  const { t } = useTranslation();
  const { space } = useTheme();
  const [items, setItems] = useState(initial);
  // The sheet's working copy. Kept after closing so the title doesn't blank out during the fade.
  const [draft, setDraft] = useState<ReactionAnswer | null>(null);
  const [open, setOpen] = useState(false);

  const savedFor = (ingredient: Ingredient) => items.find((it) => it.ingredient === ingredient);
  const others = (ingredient: Ingredient) => items.filter((it) => it.ingredient !== ingredient);
  const edit = (ingredient: Ingredient) => {
    setDraft(savedFor(ingredient) ?? { ingredient, reaction: null, severity: null });
    setOpen(true);
  };
  const saved = INGREDIENTS.flatMap((i) => savedFor(i) ?? []);
  const isSaved = !!draft && !!savedFor(draft.ingredient);

  return (
    <>
      <StepScroll>
        <ChipGroup
          codes={INGREDIENTS}
          selected={items.map((it) => it.ingredient)}
          selectedIcon={Check}
          labelOf={(c) => t(`codes.ingredient.${c}`)}
          onPress={edit}
        />
        <View style={{ gap: space.xs }}>
          <Text variant="caption" color="textMuted">{t('onboarding.reactions.hint')}</Text>
          {saved.map((it) => (
            <Text key={it.ingredient} variant="caption">
              {t('onboarding.reactions.summary', {
                ingredient: t(`codes.ingredient.${it.ingredient}`),
                reaction: t(`codes.reaction.${it.reaction!}`),
                severity: t(`codes.severity.${it.severity!}`),
              })}
            </Text>
          ))}
        </View>
      </StepScroll>
      <StepFooter
        title={items.length ? undefined : t('onboarding.reactions.none')}
        onPress={() => onSubmit(items)}
        saving={saving}
        error={error}
      />
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title={draft ? t(`codes.ingredient.${draft.ingredient}`) : undefined}
        closeLabel={t('common.close')}>
        {draft && (
          <>
            <ChipGroup
              label={t('onboarding.reactions.what')}
              codes={REACTIONS}
              selected={draft.reaction ? [draft.reaction] : []}
              labelOf={(c) => t(`codes.reaction.${c}`)}
              onPress={(reaction) => setDraft({ ...draft, reaction })}
            />
            <ChipGroup
              label={t('onboarding.reactions.howStrong')}
              codes={SEVERITIES}
              selected={draft.severity ? [draft.severity] : []}
              labelOf={(c) => t(`codes.severity.${c}`)}
              onPress={(severity) => setDraft({ ...draft, severity })}
            />
            <View style={{ gap: space.sm }}>
              <Button
                title={t('onboarding.reactions.save')}
                disabled={!draft.reaction || !draft.severity}
                onPress={() => { setItems([...others(draft.ingredient), draft]); setOpen(false); }}
              />
              {isSaved && (
                <Button
                  title={t('onboarding.reactions.remove')}
                  variant="ghost"
                  onPress={() => { setItems(others(draft.ingredient)); setOpen(false); }}
                />
              )}
            </View>
          </>
        )}
      </Sheet>
    </>
  );
}
