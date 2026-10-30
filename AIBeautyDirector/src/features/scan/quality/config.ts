// Live capture QA thresholds (docs/SCAN_PLAN.md §QA.3). Lighting is measured INSIDE the face box once a face
// is found (centre crop before that). Values are placeholders until the calibration log in docs/CAPTURE_QA.md
// has rows (§QA.8); tune here only, never inside the checks.
export const QUALITY_CONFIG = {
  // Luma sampling (Y plane of a 640×480 upright frame)
  sampleStep: 3, // every 3rd pixel in x and y
  cropFraction: 0.5, // centre crop used only until a face is found
  faceRegionWidth: 0.7, // share of the face box measured (inside hairline / ears)
  faceRegionHeight: 0.75,
  darkLevel: 40, // a sample below this counts as shadow
  brightLevel: 235, // above this counts as blown out
  // Whole-scene extremes, used only before a face region is available
  sceneMinMean: 45,
  sceneMaxMean: 225,
  // Lighting (face region)
  minMean: 95,
  maxDarkPct: 0.08,
  maxMean: 200,
  maxBrightPct: 0.04,
  maxSideImbalance: 0.3, // left vs right half of the face
  minStd: 14, // skin is smooth: contrast is low even in good light
  minLapVar: 130, // sharpness; a smudged, wet or shaking camera drops this
  // Face (ratios of the upright frame)
  minFaceWidth: 0.42,
  maxFaceWidth: 0.85,
  ovalCenterY: 0.4, // where CaptureView draws the oval (share of the frame height); the centring check targets it
  maxCenterOffset: 0.15,
  maxYaw: 12,
  maxPitch: 12,
  maxRoll: 8,
  // Readiness
  readySamples: 8, // consecutive passing samples before the shutter enables
  faceFreshMs: 400, // a face sample older than this can't make the shot ready
  faceStaleMs: 1500, // older than this counts as "no face"
  lumaStaleMs: 600,
} as const;

export type QualityConfig = { readonly [K in keyof typeof QUALITY_CONFIG]: number };

// Fixed priority: the UI shows the first reason. Face position before lighting (it is what the user fixes first).
export const QUALITY_REASONS = [
  'no_face',
  'multiple_faces',
  'face_too_small',
  'face_too_large',
  'face_off_center',
  'blurry', // before tilt and lighting: a smudged lens also skews those, and cleaning it is the real fix
  'face_tilted',
  'too_dark',
  'overexposed',
  'uneven_light',
  'low_contrast',
] as const;
export type QualityReason = (typeof QUALITY_REASONS)[number];
