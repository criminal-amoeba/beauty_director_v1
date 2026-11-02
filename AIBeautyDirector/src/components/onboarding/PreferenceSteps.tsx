import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';
import {
  BUDGETS, GOALS, LEVELS, TEXTURES, type Budget, type Goal, type Level, type Texture,
} from '@/features/onboarding/codes';
import { ChipGroup, StepFooter, StepScroll, toggle, type StepProps } from './parts';

export function GoalsStep({ initial, onSubmit, saving, error }: StepProps<Goal[]>) {
  const { t } = useTranslation();
  const [goals, setGoals] = useState(initial);
  return (
    <>
      <StepScroll>
        <ChipGroup codes={GOALS} selected={goals} labelOf={(c) => t(`codes.goal.${c}`)} onPress={(c) => setGoals(toggle(goals, c))} />
      </StepScroll>
      <StepFooter onPress={() => onSubmit(goals)} disabled={!goals.length} saving={saving} error={error} />
    </>
  );
}

export function LevelStep({ initial, onSubmit, saving, error }: StepProps<Level | null>) {
  const { t } = useTranslation();
  const [level, setLevel] = useState(initial);
  return (
    <>
      <StepScroll>
        <ChipGroup codes={LEVELS} selected={level ? [level] : []} labelOf={(c) => t(`codes.level.${c}`)} onPress={setLevel} />
        {level && <Text color="textMuted">{t(`onboarding.level.hint.${level}`)}</Text>}
      </StepScroll>
      <StepFooter onPress={() => onSubmit(level)} disabled={!level} saving={saving} error={error} />
    </>
  );
}

type BudgetValue = { budget: Budget | null; textures: Texture[] };

export function BudgetStep({ initial, onSubmit, saving, error }: StepProps<BudgetValue>) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  return (
    <>
      <StepScroll>
        <ChipGroup
          label={t('onboarding.budget.budget')}
          codes={BUDGETS}
          selected={value.budget ? [value.budget] : []}
          labelOf={(c) => t(`codes.budget.${c}`)}
          onPress={(budget) => setValue({ ...value, budget })}
        />
        <ChipGroup
          label={t('onboarding.budget.textures')}
          codes={TEXTURES}
          selected={value.textures}
          labelOf={(c) => t(`codes.texture.${c}`)}
          onPress={(c) => setValue({ ...value, textures: toggle(value.textures, c) })}
        />
        <Text variant="caption" color="textMuted">{t('onboarding.budget.texturesHelper')}</Text>
      </StepScroll>
      <StepFooter onPress={() => onSubmit(value)} disabled={!value.budget} saving={saving} error={error} />
    </>
  );
}
