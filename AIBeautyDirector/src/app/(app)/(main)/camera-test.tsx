import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FlaskConical } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, EmptyState, ErrorState, Pill, Screen, Text } from '@/components/ui';
import { CaptureView } from '@/components/scan/CaptureView';
import { checkPhotoFile, invokeScanFunction, removePhoto, uploadPhoto, type CapturedPhoto } from '@/features/scan/api';
import { ScanError, scanErrorKey, toScanError } from '@/features/scan/errors';
import type { LiveScores } from '@/features/scan/quality/useLiveQuality';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/theme/useTheme';

type Normalized =
  | { ok: true; jobId: string; metrics: { metric_code: string; value: number }[] }
  | { ok: false; code: string; reason: string };
type Result = { raw: unknown; normalized: Normalized; model_version: string; elapsed_ms: number };
type State =
  | { kind: 'capture' }
  | { kind: 'uploading' }
  | { kind: 'analyzing' }
  | { kind: 'done'; result: Result; scores: LiveScores }
  | { kind: 'error'; code: ScanError['code'] };

// Dev tool (hidden in production builds): photo → camera-test function → raw DermIQ JSON + our normalization.
// Never writes to the user's scan history; the function deletes the photo.
export default function CameraTestScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { space, colors, radii } = useTheme();
  const { session } = useAuth();
  const [state, setState] = useState<State>({ kind: 'capture' });

  if (!__DEV__) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState icon={FlaskConical} title={t('cameraTest.devOnly')} action={{ label: t('common.backHome'), onPress: () => router.back() }} />
      </Screen>
    );
  }

  const run = async (photo: CapturedPhoto, scores: LiveScores) => {
    const userId = session?.user.id;
    if (!userId) return setState({ kind: 'error', code: 'unauthorized' });
    let path: string | null = null;
    try {
      await checkPhotoFile(photo);
      setState({ kind: 'uploading' });
      path = await uploadPhoto(userId, photo.uri);
      setState({ kind: 'analyzing' });
      const result = await invokeScanFunction<Result>('camera-test', { image_path: path }, 60_000);
      setState({ kind: 'done', result, scores });
    } catch (e) {
      if (path) await removePhoto(path); // the function deletes it too; this covers a failed call
      setState({ kind: 'error', code: (await toScanError(e)).code });
    }
  };

  if (state.kind === 'capture' || state.kind === 'uploading' || state.kind === 'analyzing') {
    const busy = state.kind !== 'capture';
    return (
      <View style={{ flex: 1 }}>
        <CaptureView onCaptured={run} onCaptureError={() => setState({ kind: 'error', code: 'capture_failed' })} busy={busy} showScores />
        <View style={{ position: 'absolute', top: space.xxxl + space.lg, left: space.lg }} pointerEvents="none">
          <Pill icon={FlaskConical} label={busy ? t(`cameraTest.${state.kind}`) : t('cameraTest.devBadge')} />
        </View>
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <Screen edges={['bottom']}>
        <ErrorState
          offline={state.code === 'offline'}
          title={state.code === 'offline' ? undefined : t('error.title')}
          message={state.code === 'offline' ? undefined : `${t(`scan.errors.${scanErrorKey(state.code)}`)} (${state.code})`}
          retryLabel={t('cameraTest.retake')}
          onRetry={() => setState({ kind: 'capture' })}
        />
        {state.code === 'consent_required' && <Button title={t('privacy.title')} variant="ghost" onPress={() => router.push('/privacy')} />}
      </Screen>
    );
  }

  const { result, scores } = state;
  const n = result.normalized;
  return (
    <Screen edges={['bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text variant="h1" style={{ flex: 1 }}>{t('home.cameraTest.title')}</Text>
        <Pill icon={FlaskConical} label={t('cameraTest.devBadge')} />
      </View>
      <Text variant="caption" color="textMuted">{t('cameraTest.nothingSaved')}</Text>

      <Card tone={n.ok ? 'default' : 'primary'}>
        <Text variant="label">{n.ok ? t('cameraTest.verdictOk') : t('cameraTest.verdictInvalid', { reason: n.reason })}</Text>
        <Text variant="caption" color="textMuted">{t('cameraTest.model', { model: result.model_version, ms: result.elapsed_ms })}</Text>
      </Card>

      {n.ok && (
        <Card>
          <Text variant="label">{t('cameraTest.metricsTitle')}</Text>
          {n.metrics.map((m) => (
            <View key={m.metric_code} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.xs }}>
              <Text>{m.metric_code}</Text>
              <Text variant="label">{String(m.value)}</Text>
            </View>
          ))}
        </Card>
      )}

      <Card>
        <Text variant="label">{t('cameraTest.liveScoresTitle')}</Text>
        <Text variant="caption" color="textMuted" style={{ fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) }}>
          {JSON.stringify(scores, null, 1)}
        </Text>
      </Card>

      <Card>
        <Text variant="label">{t('cameraTest.rawTitle')}</Text>
        {/* Dev-only: monospace for JSON, the one place a non-token font is acceptable. */}
        <View style={{ backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, padding: space.sm }}>
          <Text variant="caption" style={{ fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) }} selectable>
            {JSON.stringify(result.raw, null, 2)}
          </Text>
        </View>
      </Card>

      <Button title={t('cameraTest.retake')} variant="secondary" onPress={() => setState({ kind: 'capture' })} />
      <Button title={t('common.backHome')} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
