import { useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ChevronLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Button, ErrorState, PressableScale, Screen, Skeleton, Steps, Text } from '@/components/ui';
import { BasicsStep } from '@/components/onboarding/BasicsStep';
import { ConsentStep } from '@/components/onboarding/ConsentStep';
import { BudgetStep, GoalsStep, LevelStep } from '@/components/onboarding/PreferenceSteps';
import { ProductsStep } from '@/components/onboarding/ProductsStep';
import { ReactionsStep } from '@/components/onboarding/ReactionsStep';
import { loadOnboarding, saveStep, STEPS, type Answers, type SaveError } from '@/features/onboarding/api';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/theme/useTheme';

// reached = profiles.onboarding_step: the furthest step saved, where a restart resumes.
type Wizard = { step: number; reached: number; answers: Answers };

// Each step is saved to the DB when it is submitted, so a killed app resumes at the first unanswered step.
// Finishing sets onboarding_completed; the root guard then moves to the app.
export default function OnboardingScreen() {
  const { session, signOut, finishOnboarding } = useAuth();
  const { t } = useTranslation();
  const { colors, space, layout, motion, type } = useTheme();
  const userId = session?.user.id;
  const [wizard, setWizard] = useState<Wizard | 'offline' | 'failed' | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<SaveError | null>(null);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    loadOnboarding(userId).then(
      (r) => live && setWizard(typeof r === 'string' ? r : { ...r, reached: r.step }),
      () => live && setWizard('failed'),
    );
    return () => { live = false; };
  }, [userId, attempt]);

  const ready = wizard && typeof wizard === 'object' ? wizard : null;
  const step = ready?.step ?? 0;

  const back = () => {
    if (!ready || saving || step === 0) return;
    setError(null);
    setWizard({ ...ready, step: step - 1 });
  };
  // Android back walks the steps; on the first step it leaves the app as usual.
  useEffect(() => {
    if (step === 0) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
    return () => sub.remove();
  });

  if (wizard === 'offline' || wizard === 'failed') {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ErrorState
            offline={wizard === 'offline'}
            onRetry={() => { setWizard(null); setAttempt((n) => n + 1); }}
            title={t(wizard === 'offline' ? 'onboarding.offline.title' : 'error.title')}
            message={t(wizard === 'offline' ? 'onboarding.offline.message' : 'error.message')}
            retryLabel={t('common.retry')}
          />
          <Button title={t('common.signOut')} variant="ghost" onPress={signOut} />
        </View>
      </Screen>
    );
  }

  if (!ready || !userId) {
    return (
      <Screen>
        <Skeleton height={space.xs} />
        <Skeleton width="70%" height={type.h1.lineHeight} />
        <Skeleton width="90%" />
        {[0, 1, 2].map((i) => <Skeleton key={i} height={space.xxxl + space.xl} />)}
      </Screen>
    );
  }

  const save = async (patch: Partial<Answers>) => {
    const answers = { ...ready.answers, ...patch };
    setSaving(true);
    setError(null);
    const last = step === STEPS.length - 1;
    let err = await saveStep(userId, step, answers, ready.reached);
    if (!err && last) err = await finishOnboarding(); // success: the guard moves to the app and unmounts this screen
    setSaving(false);
    if (err) return setError(err);
    if (!last) setWizard({ step: step + 1, reached: Math.max(ready.reached, step + 1), answers });
  };

  const name = STEPS[step];
  const a = ready.answers;
  const props = { saving, error };

  // Progress, title and the primary button stay put; only the step's content scrolls (StepScroll).
  return (
    <Screen scroll={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: layout.minTouch }}>
        {step > 0 && (
          <PressableScale
            onPress={back}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.back')}
            style={{ width: layout.minTouch, height: layout.minTouch, justifyContent: 'center' }}>
            <ChevronLeft size={24} color={colors.text} />
          </PressableScale>
        )}
        <View style={{ flex: 1 }}>
          <Steps current={step + 1} total={STEPS.length} label={t('onboarding.stepOf', { current: step + 1, total: STEPS.length })} />
        </View>
        {step === 0 && (
          <PressableScale
            onPress={signOut}
            accessibilityRole="button"
            accessibilityLabel={t('common.signOut')}
            style={{ minHeight: layout.minTouch, justifyContent: 'center', paddingHorizontal: space.sm }}>
            <Text variant="caption" color="textMuted">{t('common.signOut')}</Text>
          </PressableScale>
        )}
      </View>
      <Animated.View key={step} entering={FadeIn.duration(motion.normal)} style={{ flex: 1, gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text variant="h1">{t(`onboarding.steps.${name}.title`)}</Text>
          <Text color="textMuted">{t(`onboarding.steps.${name}.subtitle`)}</Text>
        </View>
        {name === 'consent' && <ConsentStep initial={a.consents} onSubmit={(consents) => save({ consents })} {...props} />}
        {name === 'basics' && <BasicsStep initial={a.basics} onSubmit={(basics) => save({ basics })} {...props} />}
        {name === 'goals' && <GoalsStep initial={a.goals} onSubmit={(goals) => save({ goals })} {...props} />}
        {name === 'level' && <LevelStep initial={a.level} onSubmit={(level) => save({ level })} {...props} />}
        {name === 'budget' && (
          <BudgetStep initial={{ budget: a.budget, textures: a.textures }} onSubmit={(v) => save(v)} {...props} />
        )}
        {name === 'reactions' && <ReactionsStep initial={a.reactions} onSubmit={(reactions) => save({ reactions })} {...props} />}
        {name === 'products' && <ProductsStep initial={a.products} onSubmit={(products) => save({ products })} {...props} />}
      </Animated.View>
    </Screen>
  );
}
