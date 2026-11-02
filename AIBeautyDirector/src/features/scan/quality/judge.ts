import { QUALITY_REASONS, type QualityConfig, type QualityReason } from './config';
import type { LumaStats } from './luma';

// What we keep from each detected face (copied out of the native object before it reaches React).
// Coordinates are in the upright, rotation-corrected frame (face detector with autoMode off).
export type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  yaw: number;
  pitch: number;
  roll: number;
  frameWidth: number;
  frameHeight: number;
};

// faces = null → face check unavailable on this device (luma-only mode, plan §QA.6).
export function judge(luma: LumaStats | null, faces: FaceBox[] | null, cfg: QualityConfig): QualityReason[] {
  const out = new Set<QualityReason>();
  if (faces) {
    if (faces.length === 0) out.add('no_face');
    else if (faces.length > 1) out.add('multiple_faces');
    else {
      const f = faces[0];
      const ratio = f.width / f.frameWidth;
      if (ratio < cfg.minFaceWidth) out.add('face_too_small');
      if (ratio > cfg.maxFaceWidth) out.add('face_too_large');
      const dx = (f.x + f.width / 2) / f.frameWidth - 0.5;
      const dy = (f.y + f.height / 2) / f.frameHeight - cfg.ovalCenterY;
      if (Math.abs(dx) > cfg.maxCenterOffset || Math.abs(dy) > cfg.maxCenterOffset) out.add('face_off_center');
      if (Math.abs(f.yaw) > cfg.maxYaw || Math.abs(f.pitch) > cfg.maxPitch || Math.abs(f.roll) > cfg.maxRoll) out.add('face_tilted');
    }
  }
  if (luma && luma.region === 'center') {
    // Whole-scene numbers (no face region yet): only flag extremes, the face thresholds don't apply to walls.
    if (luma.mean < cfg.sceneMinMean) out.add('too_dark');
    if (luma.mean > cfg.sceneMaxMean) out.add('overexposed');
  } else if (luma) {
    if (luma.mean < cfg.minMean || luma.darkPct > cfg.maxDarkPct) out.add('too_dark');
    if (luma.mean > cfg.maxMean || luma.brightPct > cfg.maxBrightPct) out.add('overexposed');
    if (luma.sideImbalance > cfg.maxSideImbalance) out.add('uneven_light');
    if (luma.std < cfg.minStd) out.add('low_contrast');
    if (luma.lapVar < cfg.minLapVar) out.add('blurry');
  }
  return QUALITY_REASONS.filter((r) => out.has(r));
}

export type Samples = {
  luma: LumaStats | null;
  lumaAt: number;
  faces: FaceBox[] | null; // latest face sample; null when the face check is unavailable
  facesAt: number;
  faceCheck: boolean;
};
export type Assessment = { reasons: QualityReason[]; fresh: boolean; passed: boolean };

// Combines the latest samples by age: a face sample older than faceStaleMs counts as no face, and the shot
// can only be ready when both samples are fresh. Missing luma = still starting (not passed, no hint).
export function assess(s: Samples, now: number, cfg: QualityConfig): Assessment {
  const lumaFresh = s.luma !== null && now - s.lumaAt <= cfg.lumaStaleMs;
  const faceAge = now - s.facesAt;
  const faces = !s.faceCheck ? null : s.faces && faceAge <= cfg.faceStaleMs ? s.faces : [];
  const reasons = judge(lumaFresh ? s.luma : null, faces, cfg);
  // With the face check on, only lighting measured inside the face box can make the shot ready.
  const lumaOnFace = !s.faceCheck || s.luma?.region === 'face';
  const fresh = lumaFresh && lumaOnFace && (!s.faceCheck || (s.faces !== null && faceAge <= cfg.faceFreshMs));
  return { reasons, fresh, passed: fresh && reasons.length === 0 };
}

// Consecutive passing samples; any failure resets. Ready once the streak reaches cfg.readySamples.
export const nextStreak = (streak: number, a: Assessment) => (a.passed ? streak + 1 : 0);
export const isReady = (streak: number, a: Assessment, cfg: QualityConfig) => a.passed && streak >= cfg.readySamples;
