import { useCallback, useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import * as Linking from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Camera as CameraIcon, CameraOff, CircleAlert, CircleCheck } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Camera, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import Svg, { Defs, Ellipse, Mask, Rect } from 'react-native-svg';
import { Button, EmptyState, ErrorState, Pill, Screen, Text } from '@/components/ui';
import type { CapturedPhoto } from '@/features/scan/api';
import { QUALITY_CONFIG } from '@/features/scan/quality/config';
import { useLiveQuality, type LiveScores } from '@/features/scan/quality/useLiveQuality';
import { useTheme } from '@/theme/useTheme';

type Props = {
  onCaptured: (photo: CapturedPhoto, scores: LiveScores) => void;
  onCaptureError: () => void;
  busy?: boolean;
  showScores?: boolean; // Camera Test: live numbers for calibration
};

const PHOTO_RESOLUTION = { width: 1280, height: 1280 };

// Front camera + framing oval + live QA hints + gated shutter (docs/SCAN_PLAN.md §QA). Shared by Weekly Scan
// and Camera Test. Only numbers leave the camera pipeline; the photo goes to the caller as a file URI.
export function CaptureView({ onCaptured, onCaptureError, busy, showScores }: Props) {
  const { t } = useTranslation();
  const { colors, space, radii, layout } = useTheme();
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const [focused, setFocused] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [capturing, setCapturing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    if (!hasPermission && canRequestPermission) requestPermission().catch(() => {});
  }, [hasPermission, canRequestPermission, requestPermission]);

  const photoOutput = usePhotoOutput({ targetResolution: PHOTO_RESOLUTION, containerFormat: 'jpeg', quality: 0.85, qualityPrioritization: 'balanced' });
  const live = useLiveQuality();

  const onLayout = (e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  const capture = async () => {
    if (capturing || busy || !live.ready) return;
    setCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const file = await photoOutput.capturePhotoToFile({ flashMode: 'off', enableShutterSound: false }, {});
      const uri = file.filePath.startsWith('file://') ? file.filePath : `file://${file.filePath}`;
      onCaptured({ uri, width: file.width, height: file.height }, live.scores);
    } catch (e) {
      if (__DEV__) console.warn('[scan] capture failed:', (e as Error).name);
      onCaptureError();
    } finally {
      setCapturing(false);
    }
  };

  if (!hasPermission) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          icon={CameraOff}
          title={t('scan.capture.permissionTitle')}
          message={t('scan.capture.permissionBody')}
          action={
            canRequestPermission
              ? { label: t('scan.capture.allowCamera'), onPress: () => requestPermission().catch(() => {}) }
              : { label: t('scan.capture.openSettings'), onPress: () => Linking.openSettings().catch(() => {}) }
          }
        />
      </Screen>
    );
  }
  if (!device) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState icon={CameraOff} title={t('scan.capture.noCameraTitle')} message={t('scan.capture.noCameraBody')} />
      </Screen>
    );
  }
  if (cameraError) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState
          title={t('scan.capture.cameraErrorTitle')}
          message={__DEV__ ? cameraError : t('error.message')}
          retryLabel={t('common.retry')}
          onRetry={() => {
            setCameraError(null);
            setCameraKey((k) => k + 1);
          }}
        />
      </Screen>
    );
  }

  const reason = live.assessment.reasons[0];
  const hint = live.ready
    ? t('scan.capture.ready')
    : reason
      ? t(`scan.quality.${reason}`)
      : live.scores.luma
        ? t('scan.capture.hold')
        : t('scan.capture.starting');
  // Large oval: the face should fill most of the frame so pores and texture are visible to the analysis.
  const ovalW = Math.min(size.width, size.height * 0.75) * 0.88;
  const ovalH = ovalW / 0.78;
  const cx = size.width / 2;
  const cy = size.height * QUALITY_CONFIG.ovalCenterY;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }} onLayout={onLayout}>
      <Camera
        key={cameraKey}
        style={{ flex: 1 }}
        device={device}
        isActive={focused && !busy}
        outputs={[photoOutput, live.frameOutput]}
        constraints={[{ fps: 30 }]}
        resizeMode="cover"
        onError={(e) => setCameraError(e.message)}
      />
      {size.width > 0 && (
        <Svg width={size.width} height={size.height} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
          <Defs>
            <Mask id="oval">
              <Rect width="100%" height="100%" fill="white" />
              <Ellipse cx={cx} cy={cy} rx={ovalW / 2} ry={ovalH / 2} fill="black" />
            </Mask>
          </Defs>
          <Rect width="100%" height="100%" fill={colors.scrim} mask="url(#oval)" />
          <Ellipse cx={cx} cy={cy} rx={ovalW / 2} ry={ovalH / 2} stroke={live.ready ? colors.success : colors.warning} strokeWidth={3} fill="none" />
        </Svg>
      )}

      <View style={{ position: 'absolute', top: space.lg, left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.lg }} accessibilityLiveRegion="polite">
        <Pill icon={live.ready ? CircleCheck : CircleAlert} tone={live.ready ? 'primary' : 'neutral'} label={hint} />
        {!live.faceCheck && (
          <View style={{ marginTop: space.xs }}>
            <Pill label={t('scan.capture.faceCheckUnavailable')} />
          </View>
        )}
      </View>

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: space.lg,
          gap: space.sm,
          backgroundColor: colors.surface,
          borderTopLeftRadius: radii.lg,
          borderTopRightRadius: radii.lg,
          maxWidth: layout.maxContentWidth,
          alignSelf: 'center',
          width: '100%',
        }}>
        {showScores && <Scores scores={live.scores} />}
        <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>{t('scan.capture.tips')}</Text>
        <Button title={t('scan.capture.shutter')} icon={CameraIcon} onPress={capture} disabled={!live.ready || busy} loading={capturing || busy} />
      </View>
    </View>
  );
}

// Dev-only numbers next to the thresholds (plan §QA.8 calibration).
function Scores({ scores }: { scores: LiveScores }) {
  const { luma, face, faces, droppedFrames, frame } = scores;
  const f = (n: number | undefined | null, d = 0) => (n == null ? '–' : n.toFixed(d));
  const line1 = luma
    ? `${luma.region} · mean ${f(luma.mean)} · dark ${f(luma.darkPct * 100)}% · bright ${f(luma.brightPct * 100)}% · side ${f(luma.sideImbalance, 2)} · std ${f(luma.std)} · lap ${f(luma.lapVar)}`
    : 'luma: –';
  const line2 = face
    ? `faces ${faces} · w ${f(face.width / face.frameWidth, 2)} · dx ${f((face.x + face.width / 2) / face.frameWidth - 0.5, 2)} · dy ${f((face.y + face.height / 2) / face.frameHeight - 0.5, 2)} · yaw ${f(face.yaw)} pitch ${f(face.pitch)} roll ${f(face.roll)}`
    : `faces ${faces}`;
  return (
    <View>
      <Text variant="caption" color="textMuted">{line1}</Text>
      <Text variant="caption" color="textMuted">{line2}</Text>
      <Text variant="caption" color="textMuted">
        {frame
          ? `plane ${frame.planeWidth}×${frame.planeHeight} ${frame.orientation}${frame.mirrored ? ' mirrored' : ''} · mlkit ${frame.mlkitWidth}×${frame.mlkitHeight} · dropped ${droppedFrames}`
          : `dropped ${droppedFrames}`}
      </Text>
    </View>
  );
}
