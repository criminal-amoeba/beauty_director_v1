import { useCallback, useRef, useState } from 'react';
import { useFrameOutput, type CameraFrameOutput, type Frame } from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { scheduleOnRN } from 'react-native-worklets';
import { QUALITY_CONFIG, type QualityConfig } from './config';
import { assess, isReady, nextStreak, type Assessment, type FaceBox, type Samples } from './judge';
import { analyzeLuma, centerRegion, faceRegion, mapFaceToPlane, type LumaStats } from './luma';

// Dev diagnostics: where the pixels and ML Kit's coordinates come from on this device.
export type FrameInfo = { planeWidth: number; planeHeight: number; orientation: string; mirrored: boolean; mlkitWidth: number; mlkitHeight: number };
export type LiveScores = { luma: LumaStats | null; face: FaceBox | null; faces: number; droppedFrames: number; frame: FrameInfo | null };
export type LiveQuality = {
  frameOutput: CameraFrameOutput;
  assessment: Assessment;
  ready: boolean;
  faceCheck: boolean; // false = ML Kit failed on this device, luma-only mode (plan §QA.6)
  scores: LiveScores;
};

const UI_THROTTLE_MS = 200;
const FRAME_RESOLUTION = { width: 640, height: 480 };

// One camera frame output does both checks (plan §QA.2): luma on the Y plane, then ML Kit faces, both
// inline. Only numbers cross to React; frames are disposed on every path.
export function useLiveQuality(cfg: QualityConfig = QUALITY_CONFIG): LiveQuality {
  const samples = useRef<Samples>({ luma: null, lumaAt: 0, faces: null, facesAt: 0, faceCheck: true });
  const streak = useRef(0);
  const dropped = useRef(0);
  const frameInfo = useRef<FrameInfo | null>(null);
  const lastUi = useRef(0);
  const [state, setState] = useState<Omit<LiveQuality, 'frameOutput'>>({
    assessment: { reasons: [], fresh: false, passed: false },
    ready: false,
    faceCheck: true,
    scores: { luma: null, face: null, faces: 0, droppedFrames: 0, frame: null },
  });

  const tick = useCallback(() => {
    const now = Date.now();
    const s = samples.current;
    const assessment = assess(s, now, cfg);
    streak.current = nextStreak(streak.current, assessment);
    const ready = isReady(streak.current, assessment, cfg);
    setState((prev) => {
      const changed = prev.ready !== ready || prev.assessment.reasons[0] !== assessment.reasons[0] || prev.faceCheck !== s.faceCheck;
      if (!changed && now - lastUi.current < UI_THROTTLE_MS) return prev;
      lastUi.current = now;
      return {
        assessment,
        ready,
        faceCheck: s.faceCheck,
        scores: { luma: s.luma, face: s.faces?.[0] ?? null, faces: s.faces?.length ?? 0, droppedFrames: dropped.current, frame: frameInfo.current },
      };
    });
  }, [cfg]);

  const onLuma = useCallback((luma: LumaStats, info: FrameInfo) => {
    samples.current = { ...samples.current, luma, lumaAt: Date.now() };
    frameInfo.current = info;
    tick();
  }, [tick]);
  const onFaces = useCallback((faces: FaceBox[]) => {
    samples.current = { ...samples.current, faces, facesAt: Date.now() };
    tick();
  }, [tick]);
  const onFaceError = useCallback((message: string) => {
    if (__DEV__) console.warn('[scan] face check unavailable:', message);
    samples.current = { ...samples.current, faceCheck: false, faces: null };
    tick();
  }, [tick]);

  const faceDetector = useFaceDetector({ performanceMode: 'fast', minFaceSize: 0.15, cameraFacing: 'front', autoMode: false });

  // Everything runs inline on the camera thread. A nested AsyncRunner worklet was tried first and failed on
  // device: functions captured two hops deep (scheduleOnRN, callbacks) arrive there as plain objects.
  // `dropFramesWhileBusy` keeps the preview smooth while a detection (~20–60 ms) is in progress.
  const onFrame = useCallback((frame: Frame) => {
    'worklet';
    try {
      const planes = frame.getPlanes();
      if (planes.length === 0) return;
      const y = planes[0];

      let boxes: FaceBox[] | null = null;
      try {
        const faces = faceDetector.detectFaces(frame);
        boxes = [];
        for (let i = 0; i < faces.length; i++) {
          const f = faces[i];
          boxes.push({
            x: f.bounds.x,
            y: f.bounds.y,
            width: f.bounds.width,
            height: f.bounds.height,
            yaw: f.yawAngle,
            pitch: f.pitchAngle,
            roll: f.rollAngle,
            frameWidth: f.frameWidth,
            frameHeight: f.frameHeight,
          });
        }
      } catch (e) {
        scheduleOnRN(onFaceError, String(e));
      }
      if (boxes !== null) scheduleOnRN(onFaces, boxes);

      // Lighting inside the face when exactly one face is found: ML Kit's upright box is mapped back onto the
      // raw Y plane using the frame's orientation. Otherwise the centre crop (hints only, never "ready").
      const one = boxes !== null && boxes.length === 1 ? boxes[0] : null;
      const mapped = one !== null ? mapFaceToPlane(one, y.width, y.height, frame.orientation) : null;
      const region = mapped !== null ? faceRegion(mapped, y.width, y.height, cfg) : centerRegion(y.width, y.height, cfg);
      const luma = analyzeLuma(new Uint8Array(y.getPixelBuffer()), y.bytesPerRow, region, mapped !== null ? 'face' : 'center', cfg);
      const info: FrameInfo = {
        planeWidth: y.width,
        planeHeight: y.height,
        orientation: frame.orientation,
        mirrored: frame.isMirrored,
        mlkitWidth: one !== null ? one.frameWidth : 0,
        mlkitHeight: one !== null ? one.frameHeight : 0,
      };
      scheduleOnRN(onLuma, luma, info);
    } finally {
      frame.dispose();
    }
  }, [cfg, faceDetector, onLuma, onFaces, onFaceError]);

  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    targetResolution: FRAME_RESOLUTION,
    dropFramesWhileBusy: true,
    onFrame,
    onFrameDropped: () => {
      dropped.current++;
    },
  });

  return { frameOutput, ...state };
}
