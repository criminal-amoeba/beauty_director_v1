import { QUALITY_CONFIG as cfg, QUALITY_REASONS, type QualityConfig } from '../config';
import { assess, isReady, judge, nextStreak, type FaceBox, type Samples } from '../judge';
import { analyzeLuma, centerRegion, faceRegion, mapFaceToPlane, type LumaStats, type Region } from '../luma';

const W = 96;
const H = 72;
// A Y plane with optional row padding; padding bytes are 255 so any read of them would skew the stats.
function plane(fn: (x: number, y: number) => number, stride = W) {
  const buf = new Uint8Array(stride * H).fill(255);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) buf[y * stride + x] = fn(x, y);
  return buf;
}
const centre = (c: QualityConfig = cfg) => centerRegion(W, H, c);
const luma = (fn: (x: number, y: number) => number, stride = W, c: QualityConfig = cfg, region: Region = centre(c), kind: 'face' | 'center' = 'center') =>
  analyzeLuma(plane(fn, stride), stride, region, kind, c);

describe('analyzeLuma', () => {
  it('flat dark: low mean, all shadow, no contrast, no sharpness', () => {
    const s = luma(() => 10);
    expect(s).toMatchObject({ mean: 10, darkPct: 1, brightPct: 0, std: 0, lapVar: 0, sideImbalance: 0, region: 'center' });
  });

  it('flat bright: all blown out', () => {
    const s = luma(() => 250);
    expect(s.mean).toBe(250);
    expect(s.brightPct).toBe(1);
    expect(s.darkPct).toBe(0);
  });

  it('fine pattern not aligned with the sample step: mid mean, contrast and sharpness', () => {
    const s = luma((x, y) => ((x + y) % 2 === 0 ? 200 : 60));
    expect(s.mean).toBeGreaterThan(60);
    expect(s.mean).toBeLessThan(200);
    expect(s.std).toBeGreaterThan(cfg.minStd);
    expect(s.lapVar).toBeGreaterThan(10_000);
  });

  it('smooth gradient: contrast without sharpness (reads as blurred)', () => {
    const s = luma((x) => 40 + x * 2);
    expect(s.std).toBeGreaterThan(cfg.minStd);
    expect(s.lapVar).toBeLessThan(cfg.minLapVar);
  });

  it('blurring a sharp pattern lowers the Laplacian variance', () => {
    const sharp = luma((x) => (Math.floor(x / 4) % 2 ? 200 : 60));
    const blurred = luma((x) => 130 + 70 * Math.sin((x / 8) * Math.PI));
    expect(blurred.lapVar).toBeLessThan(sharp.lapVar / 10);
  });

  it('side imbalance: a face lit from one side', () => {
    const even = luma(() => 120);
    expect(even.sideImbalance).toBe(0);
    const r = centre();
    const lit = luma((x) => (x < r.x + r.width / 2 ? 160 : 60));
    expect(lit.sideImbalance).toBeGreaterThan(cfg.maxSideImbalance);
    const mild = luma((x) => (x < r.x + r.width / 2 ? 120 : 100));
    expect(mild.sideImbalance).toBeLessThan(cfg.maxSideImbalance);
  });

  it('ignores row padding (bytesPerRow > width)', () => {
    expect(luma(() => 100, W + 16)).toEqual(luma(() => 100));
    expect(luma((x, y) => (x * 7 + y * 3) % 256, W + 13)).toEqual(luma((x, y) => (x * 7 + y * 3) % 256));
  });

  it('only reads inside the region', () => {
    const r = centre();
    const inside = (x: number, y: number) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
    const s = luma((x, y) => (inside(x, y) ? 128 : 0));
    expect(s.mean).toBe(128);
    expect(s.darkPct).toBe(0);
  });

  it('never reads outside the buffer with a full-frame crop and step 1', () => {
    const c = { ...cfg, cropFraction: 1, sampleStep: 1 };
    const s = luma(() => 90, W, c, centre(c));
    expect(s.mean).toBe(90);
    expect(Number.isFinite(s.lapVar)).toBe(true);
  });

  it('measures the face region, not the background', () => {
    const face = { x: 24, y: 12, width: 48, height: 56 };
    const region = faceRegion(face, W, H, cfg);
    expect(region.x).toBeGreaterThan(face.x);
    expect(region.x + region.width).toBeLessThan(face.x + face.width);
    expect(region.width).toBeCloseTo(face.width * cfg.faceRegionWidth, 0);
    const inFace = (x: number, y: number) => x >= face.x && x < face.x + face.width && y >= face.y && y < face.y + face.height;
    const shadowedFaceBrightRoom = luma((x, y) => (inFace(x, y) ? 30 : 220), W, cfg, region, 'face');
    expect(shadowedFaceBrightRoom.mean).toBe(30);
    expect(shadowedFaceBrightRoom.region).toBe('face');
  });

  it('maps an upright ML Kit box onto the raw plane for every orientation', () => {
    // Plane 640×480 (landscape sensor); upright image 480×640. Box near the upright top-left.
    const box = { x: 40, y: 100, width: 200, height: 240, frameWidth: 480, frameHeight: 640 };
    expect(mapFaceToPlane({ ...box, frameWidth: 640, frameHeight: 480 }, 640, 480, 'up')).toEqual({ x: 40, y: 100, width: 200, height: 240 });
    // 'left' = rotate plane 90° cw to get upright: upright x comes from plane bottom, upright y from plane x.
    expect(mapFaceToPlane(box, 640, 480, 'left')).toEqual({ x: 100, y: 480 - 240, width: 240, height: 200 });
    // 'right' = rotate 270° cw: upright x comes from plane y, upright y from plane right edge.
    expect(mapFaceToPlane(box, 640, 480, 'right')).toEqual({ x: 640 - 340, y: 40, width: 240, height: 200 });
    expect(mapFaceToPlane({ ...box, frameWidth: 640, frameHeight: 480 }, 640, 480, 'down')).toEqual({ x: 640 - 240, y: 480 - 340, width: 200, height: 240 });
    // Sizes that don't fit the orientation → null (centre crop fallback)
    expect(mapFaceToPlane(box, 640, 480, 'up')).toBeNull();
    expect(mapFaceToPlane({ ...box, frameWidth: 640, frameHeight: 480 }, 640, 480, 'left')).toBeNull();
  });

  it('a mapped box lands on the same pixels for every orientation', () => {
    // Bright square in the plane; the upright box that covers it must measure it whichever way the plane is rotated.
    const sq = { x: 20, y: 30, width: 24, height: 18 }; // in plane coords (W=96, H=72)
    const inSq = (x: number, y: number) => x >= sq.x && x < sq.x + sq.width && y >= sq.y && y < sq.y + sq.height;
    const c = { ...cfg, faceRegionWidth: 1, faceRegionHeight: 1, sampleStep: 1 };
    const cases: [import('../luma').FrameOrientation, Region & { frameWidth: number; frameHeight: number }][] = [
      ['up', { ...sq, frameWidth: W, frameHeight: H }],
      ['down', { x: W - sq.x - sq.width, y: H - sq.y - sq.height, width: sq.width, height: sq.height, frameWidth: W, frameHeight: H }],
      ['left', { x: H - sq.y - sq.height, y: sq.x, width: sq.height, height: sq.width, frameWidth: H, frameHeight: W }],
      ['right', { x: sq.y, y: W - sq.x - sq.width, width: sq.height, height: sq.width, frameWidth: H, frameHeight: W }],
    ];
    for (const [orientation, upright] of cases) {
      const mapped = mapFaceToPlane(upright, W, H, orientation);
      expect(mapped).toEqual(sq);
      const s = luma((x, y) => (inSq(x, y) ? 200 : 20), W, c, faceRegion(mapped!, W, H, c), 'face');
      expect({ orientation, mean: s.mean }).toEqual({ orientation, mean: 200 });
    }
  });

  it('clamps a face region at the plane edges', () => {
    const r = faceRegion({ x: -10, y: -10, width: 200, height: 200 }, W, H, cfg);
    expect(r.x).toBeGreaterThanOrEqual(1);
    expect(r.y).toBeGreaterThanOrEqual(1);
    expect(r.x + r.width).toBeLessThanOrEqual(W - 1);
    expect(r.y + r.height).toBeLessThanOrEqual(H - 1);
  });
});

const good: LumaStats = { mean: 130, darkPct: 0.02, brightPct: 0.01, std: 30, lapVar: 200, sideImbalance: 0.1, region: 'face' };
const face = (o: Partial<FaceBox> = {}): FaceBox => ({
  x: 96, y: 86, width: 288, height: 340, yaw: 0, pitch: 0, roll: 0, frameWidth: 480, frameHeight: 640, ...o,
});

describe('judge', () => {
  it('a centred, straight face in good light passes', () => {
    expect(judge(good, [face()], cfg)).toEqual([]);
  });

  it('reports face count problems', () => {
    expect(judge(good, [], cfg)).toEqual(['no_face']);
    expect(judge(good, [face(), face({ x: 0 })], cfg)).toEqual(['multiple_faces']);
  });

  it('checks size against the frame width', () => {
    const w = (ratio: number) => face({ width: ratio * 480, x: 240 - (ratio * 480) / 2 });
    expect(judge(good, [w(cfg.minFaceWidth - 0.01)], cfg)).toEqual(['face_too_small']);
    expect(judge(good, [w(cfg.minFaceWidth)], cfg)).toEqual([]);
    expect(judge(good, [w(cfg.maxFaceWidth + 0.01)], cfg)).toEqual(['face_too_large']);
  });

  it('checks horizontal and vertical centring', () => {
    expect(judge(good, [face({ x: 96 + (cfg.maxCenterOffset + 0.01) * 480 })], cfg)).toEqual(['face_off_center']);
    expect(judge(good, [face({ y: 86 - (cfg.maxCenterOffset + 0.01) * 640 })], cfg)).toEqual(['face_off_center']);
    expect(judge(good, [face({ x: 96 + (cfg.maxCenterOffset - 0.01) * 480 })], cfg)).toEqual([]);
  });

  it('checks yaw, pitch and roll in both directions', () => {
    for (const o of [{ yaw: cfg.maxYaw + 1 }, { yaw: -cfg.maxYaw - 1 }, { pitch: cfg.maxPitch + 1 }, { pitch: -cfg.maxPitch - 1 }, { roll: cfg.maxRoll + 1 }, { roll: -cfg.maxRoll - 1 }]) {
      expect(judge(good, [face(o)], cfg)).toEqual(['face_tilted']);
    }
    expect(judge(good, [face({ yaw: cfg.maxYaw, pitch: -cfg.maxPitch, roll: cfg.maxRoll })], cfg)).toEqual([]);
  });

  it('checks lighting, balance and sharpness', () => {
    expect(judge({ ...good, mean: cfg.minMean - 1 }, [face()], cfg)).toEqual(['too_dark']);
    expect(judge({ ...good, darkPct: cfg.maxDarkPct + 0.01 }, [face()], cfg)).toEqual(['too_dark']);
    expect(judge({ ...good, mean: cfg.maxMean + 1 }, [face()], cfg)).toEqual(['overexposed']);
    expect(judge({ ...good, brightPct: cfg.maxBrightPct + 0.01 }, [face()], cfg)).toEqual(['overexposed']);
    expect(judge({ ...good, sideImbalance: cfg.maxSideImbalance + 0.01 }, [face()], cfg)).toEqual(['uneven_light']);
    expect(judge({ ...good, std: cfg.minStd - 1 }, [face()], cfg)).toEqual(['low_contrast']);
    expect(judge({ ...good, lapVar: cfg.minLapVar - 1 }, [face()], cfg)).toEqual(['blurry']);
  });

  it('returns every failing reason in the fixed priority order', () => {
    const r = judge({ mean: 20, darkPct: 0.9, brightPct: 0, std: 2, lapVar: 1, sideImbalance: 0.9, region: 'face' }, [face({ width: 100, yaw: 40 })], cfg);
    expect(r).toEqual(['face_too_small', 'face_off_center', 'blurry', 'face_tilted', 'too_dark', 'uneven_light', 'low_contrast']);
    expect([...r].sort((a, b) => QUALITY_REASONS.indexOf(a) - QUALITY_REASONS.indexOf(b))).toEqual(r);
  });

  it('applies only scene extremes to centre-crop numbers', () => {
    const scene = { ...good, region: 'center' as const };
    expect(judge({ ...scene, mean: cfg.minMean - 1, darkPct: 0.5, std: 1, lapVar: 1, sideImbalance: 1 }, [face()], cfg)).toEqual([]);
    expect(judge({ ...scene, mean: cfg.sceneMinMean - 1 }, [face()], cfg)).toEqual(['too_dark']);
    expect(judge({ ...scene, mean: cfg.sceneMaxMean + 1 }, [face()], cfg)).toEqual(['overexposed']);
  });

  it('skips face checks when the face check is unavailable (null)', () => {
    expect(judge(good, null, cfg)).toEqual([]);
    expect(judge({ ...good, mean: 50 }, null, cfg)).toEqual(['too_dark']);
  });
});

describe('assess + readiness', () => {
  const now = 10_000;
  const fresh: Samples = { luma: good, lumaAt: now - 50, faces: [face()], facesAt: now - 100, faceCheck: true };

  it('fresh good samples pass', () => {
    expect(assess(fresh, now, cfg)).toEqual({ reasons: [], fresh: true, passed: true });
  });

  it('no luma yet: not passed, no hint', () => {
    expect(assess({ ...fresh, luma: null }, now, cfg)).toMatchObject({ passed: false, fresh: false, reasons: [] });
  });

  it('lighting measured on the frame centre (no face region yet) never makes the shot ready', () => {
    expect(assess({ ...fresh, luma: { ...good, region: 'center' } }, now, cfg)).toMatchObject({ passed: false, reasons: [] });
    expect(assess({ ...fresh, luma: { ...good, region: 'center' }, faceCheck: false, faces: null }, now, cfg).passed).toBe(true);
  });

  it('a face sample older than faceFreshMs blocks readiness but still shows no hint', () => {
    expect(assess({ ...fresh, facesAt: now - 500 }, now, cfg)).toEqual({ reasons: [], fresh: false, passed: false });
  });

  it('a face sample older than faceStaleMs counts as no face', () => {
    expect(assess({ ...fresh, facesAt: now - 1600 }, now, cfg).reasons).toEqual(['no_face']);
  });

  it('stale luma is ignored', () => {
    expect(assess({ ...fresh, luma: { ...good, mean: 10 }, lumaAt: now - 700 }, now, cfg)).toMatchObject({ reasons: [], passed: false });
  });

  it('luma-only mode passes on lighting alone', () => {
    expect(assess({ ...fresh, faceCheck: false, faces: null }, now, cfg)).toEqual({ reasons: [], fresh: true, passed: true });
  });

  it('needs readySamples consecutive passes; one failure resets', () => {
    const pass = assess(fresh, now, cfg);
    const fail = assess({ ...fresh, faces: [] }, now, cfg);
    let streak = 0;
    for (let i = 1; i < cfg.readySamples; i++) {
      streak = nextStreak(streak, pass);
      expect(isReady(streak, pass, cfg)).toBe(false);
    }
    streak = nextStreak(streak, pass);
    expect(isReady(streak, pass, cfg)).toBe(true);
    streak = nextStreak(streak, fail);
    expect(streak).toBe(0);
    expect(isReady(streak, fail, cfg)).toBe(false);
  });
});
