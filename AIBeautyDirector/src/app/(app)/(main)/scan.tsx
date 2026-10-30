import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ScanFace, ShieldCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { ScanCard } from '@/components/home/ScanCard';
import { CaptureView } from '@/components/scan/CaptureView';
import { ScanProgress, type ScanStage } from '@/components/scan/ScanProgress';
import { useConsents } from '@/features/consent/api';
import { isOffline } from '@/features/routine/api';
import { homeKey, useHome } from '@/features/routine/hooks';
import { checkPhotoFile, inFlightStatus, removePhoto, runWeeklyScan, uploadPhoto, type CapturedPhoto } from '@/features/scan/api';
import { scanDue } from '@/features/scan/due';
import { type ScanError, scanErrorKey, toScanError } from '@/features/scan/errors';
import { useNow } from '@/lib/use-now';
import { useTheme } from '@/theme/useTheme';

type State =
  | { kind: 'arrival' }
  | { kind: 'capture' }
  | { kind: 'running'; stage: ScanStage; startedAt: number }
  | { kind: 'error'; code: ScanError['code'] };

const POLL_MS = 2000;

// Weekly Scan (plan §8): not due → countdown; due → arrival → capture → progress → Chat with the review.
// The 7-day rule is enforced by the function; the countdown here is cosmetic.
export default function WeeklyScanScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const { t } = useTranslation();
  const { space } = useTheme();
  const { data, error, isPending, refetch, isRefetching, userId } = useHome();
  const consents = useConsents();
  const now = useNow(60_000);
  const [state, setState] = useState<State>({ kind: 'arrival' });

  // Stage poller: the scans row says pending (analyzing) then processing (reviewing).
  const running = state.kind === 'running';
  useEffect(() => {
    if (!running || !userId) return;
    const id = setInterval(() => {
      inFlightStatus(userId).then((s) => {
        if (!s) return;
        setState((cur) => (cur.kind === 'running' ? { ...cur, stage: s === 'pending' ? 'analyzing' : 'reviewing' } : cur));
      }, () => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [running, userId]);

  const run = async (photo: CapturedPhoto) => {
    if (!userId) return setState({ kind: 'error', code: 'unauthorized' });
    const startedAt = Date.now();
    let path: string | null = null;
    try {
      await checkPhotoFile(photo);
      setState({ kind: 'running', stage: 'uploading', startedAt });
      path = await uploadPhoto(userId, photo.uri);
      setState({ kind: 'running', stage: 'analyzing', startedAt });
      const result = await runWeeklyScan(path);
      await client.invalidateQueries({ queryKey: homeKey(userId) });
      router.replace({ pathname: '/chat', params: { thread: result.thread_id } });
    } catch (e) {
      const err = await toScanError(e);
      if (path && err.code === 'unauthorized') await removePhoto(path); // the function deletes it in every other case
      if (err.code === 'consent_required') { // withdrawn on another device: reload, the consent card explains
        await consents.refetch();
        return setState({ kind: 'arrival' });
      }
      setState({ kind: 'error', code: err.code });
    }
  };

  if (isPending || consents.isPending) {
    return (
      <Screen edges={['bottom']}>
        <Skeleton width="60%" height={space.xxl} />
        <Skeleton height={space.xxxl * 4} />
      </Screen>
    );
  }
  if (!data || !consents.data) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState
          offline={isOffline(error ?? consents.error)}
          onRetry={() => { refetch(); consents.refetch(); }}
          retrying={isRefetching || consents.isRefetching}
          retryLabel={t('common.retry')}
        />
      </Screen>
    );
  }

  const { due } = scanDue(data.lastScanAt, now);
  if (!due) {
    return (
      <Screen edges={['bottom']}>
        <ScanCard lastScanAt={data.lastScanAt} tz={data.tz} onStart={() => {}} />
        <Text color="textMuted">{t('scan.notDue.body')}</Text>
        <Button title={t('common.backHome')} variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  // Photo consent withdrawn in Privacy & consent: explain before the camera opens (the function checks it too).
  if (!consents.data.photo_analysis?.granted) {
    return (
      <Screen edges={['bottom']}>
        <Card tone="primary" style={{ gap: space.md, padding: space.xl }}>
          <Text variant="h2">{t('scan.consentOff.title')}</Text>
          <Text color="textMuted">{t('scan.consentOff.body')}</Text>
        </Card>
        <Button title={t('privacy.title')} icon={ShieldCheck} onPress={() => router.push('/privacy')} />
        <Button title={t('common.backHome')} variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (state.kind === 'running') return <ScanProgress stage={state.stage} startedAt={state.startedAt} />;

  if (state.kind === 'capture') {
    return (
      <View style={{ flex: 1 }}>
        <CaptureView onCaptured={run} onCaptureError={() => setState({ kind: 'error', code: 'capture_failed' })} />
      </View>
    );
  }

  if (state.kind === 'error') {
    const key = scanErrorKey(state.code);
    return (
      <Screen edges={['bottom']}>
        <ErrorState
          offline={state.code === 'offline'}
          title={state.code === 'offline' ? undefined : t('error.title')}
          message={state.code === 'offline' ? undefined : t(`scan.errors.${key}`)}
          retryLabel={t('scan.retry')}
          onRetry={() => setState({ kind: 'capture' })}
        />
        <Button title={t('common.backHome')} variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <Card tone="primary" style={{ gap: space.md, padding: space.xl }}>
        <Text variant="h1">{data.lastScanAt ? t('home.scan.arrived') : t('scan.arrival.firstTitle')}</Text>
        <Text color="textMuted">{t('scan.arrival.body')}</Text>
        <Text variant="caption" color="textMuted">{t('scan.capture.tips')}</Text>
      </Card>
      <Text variant="caption" color="textMuted">{t('scan.disclaimer')}</Text>
      <Button title={t('scan.arrival.start')} icon={ScanFace} onPress={() => setState({ kind: 'capture' })} />
      <Button title={t('common.backHome')} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
