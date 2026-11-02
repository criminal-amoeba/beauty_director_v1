import type { QualityConfig } from './config';

export type LumaStats = {
  mean: number;
  darkPct: number;
  brightPct: number;
  std: number;
  lapVar: number;
  sideImbalance: number; // |left − right| / mean of the region; catches a face lit from one side
  region: 'face' | 'center';
};

export type Region = { x: number; y: number; width: number; height: number };
export type FrameOrientation = 'up' | 'right' | 'down' | 'left';

// ML Kit reports face boxes in the upright image (frameWidth × frameHeight); the Y plane is the raw sensor
// buffer (planeWidth × planeHeight), which VisionCamera says must be rotated by `orientation` to be upright
// (Android maps rotationDegrees 90 → 'left', 180 → 'down', 270 → 'right'). This maps the box back onto the
// plane. Returns null when the sizes don't fit the stated orientation (then the centre crop is used).
export function mapFaceToPlane(
  face: Region & { frameWidth: number; frameHeight: number },
  planeWidth: number,
  planeHeight: number,
  orientation: FrameOrientation,
): Region | null {
  'worklet';
  const swapped = orientation === 'left' || orientation === 'right';
  const expectW = swapped ? planeHeight : planeWidth;
  const expectH = swapped ? planeWidth : planeHeight;
  if (face.frameWidth !== expectW || face.frameHeight !== expectH) return null;
  const u0 = face.x;
  const v0 = face.y;
  const u1 = face.x + face.width;
  const v1 = face.y + face.height;
  let x0: number;
  let y0: number;
  let x1: number;
  let y1: number;
  if (orientation === 'up') {
    x0 = u0; y0 = v0; x1 = u1; y1 = v1;
  } else if (orientation === 'left') {
    // upright = plane rotated 90° clockwise: u = Hp − y, v = x
    x0 = v0; x1 = v1; y0 = planeHeight - u1; y1 = planeHeight - u0;
  } else if (orientation === 'right') {
    // upright = plane rotated 270° clockwise: u = y, v = Wp − x
    x0 = planeWidth - v1; x1 = planeWidth - v0; y0 = u0; y1 = u1;
  } else {
    x0 = planeWidth - u1; x1 = planeWidth - u0; y0 = planeHeight - v1; y1 = planeHeight - v0;
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// The part of a face box we measure: inside the hairline and jaw, so hair and background don't count.
// Keeps a 1 px border inside the plane so the Laplacian can read neighbours.
export function faceRegion(face: Region, planeWidth: number, planeHeight: number, cfg: QualityConfig): Region {
  'worklet';
  const w = face.width * cfg.faceRegionWidth;
  const h = face.height * cfg.faceRegionHeight;
  const x = Math.max(1, Math.round(face.x + (face.width - w) / 2));
  const y = Math.max(1, Math.round(face.y + (face.height - h) / 2));
  return { x, y, width: Math.max(0, Math.min(planeWidth - 1 - x, Math.round(w))), height: Math.max(0, Math.min(planeHeight - 1 - y, Math.round(h))) };
}

export function centerRegion(planeWidth: number, planeHeight: number, cfg: QualityConfig): Region {
  'worklet';
  const marginX = Math.max(1, Math.floor((planeWidth * (1 - cfg.cropFraction)) / 2));
  const marginY = Math.max(1, Math.floor((planeHeight * (1 - cfg.cropFraction)) / 2));
  return { x: marginX, y: marginY, width: planeWidth - 2 * marginX, height: planeHeight - 2 * marginY };
}

// Lighting and sharpness from a luminance (Y) plane inside `region`. Runs inside the camera frame worklet, so
// it is a 'worklet' with no closures and no allocations beyond numbers. `stride` = bytes per row (may exceed
// width). Samples every cfg.sampleStep px; sharpness = variance of the 3×3 Laplacian with immediate neighbours.
// The region must leave a 1 px border inside the plane (faceRegion/centerRegion guarantee that).
export function analyzeLuma(
  y: Uint8Array,
  stride: number,
  region: Region,
  regionKind: 'face' | 'center',
  cfg: QualityConfig,
): LumaStats {
  'worklet';
  const step = Math.max(1, cfg.sampleStep);
  const x0 = region.x;
  const x1 = region.x + region.width;
  const y0 = region.y;
  const y1 = region.y + region.height;
  const mid = (x0 + x1) / 2;
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  let dark = 0;
  let bright = 0;
  let lapSum = 0;
  let lapSumSq = 0;
  let nL = 0;
  let sumL = 0;
  let nR = 0;
  let sumR = 0;
  for (let row = y0; row < y1; row += step) {
    const base = row * stride;
    for (let col = x0; col < x1; col += step) {
      const v = y[base + col];
      n++;
      sum += v;
      sumSq += v * v;
      if (v < cfg.darkLevel) dark++;
      else if (v > cfg.brightLevel) bright++;
      if (col < mid) {
        nL++;
        sumL += v;
      } else {
        nR++;
        sumR += v;
      }
      const lap = 4 * v - y[base + col - 1] - y[base + col + 1] - y[base - stride + col] - y[base + stride + col];
      lapSum += lap;
      lapSumSq += lap * lap;
    }
  }
  if (n === 0) return { mean: 0, darkPct: 1, brightPct: 0, std: 0, lapVar: 0, sideImbalance: 0, region: regionKind };
  const mean = sum / n;
  const lapMean = lapSum / n;
  const meanL = nL > 0 ? sumL / nL : mean;
  const meanR = nR > 0 ? sumR / nR : mean;
  return {
    mean,
    darkPct: dark / n,
    brightPct: bright / n,
    std: Math.sqrt(Math.max(0, sumSq / n - mean * mean)),
    lapVar: Math.max(0, lapSumSq / n - lapMean * lapMean),
    sideImbalance: mean > 0 ? Math.abs(meanL - meanR) / mean : 0,
    region: regionKind,
  };
}
