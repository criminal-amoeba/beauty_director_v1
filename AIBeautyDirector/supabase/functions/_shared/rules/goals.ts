// Skin goals (skin_profiles.goals codes) → the metrics that speak to them, and the trend comparability rule.
import type { MetricCode } from '../codes.ts';

export const GOAL_METRICS: Readonly<Record<string, readonly MetricCode[]>> = {
  hydration: ['hydration_balance', 'texture_smoothness'], // texture stays as the proxy when hd_moisture is absent
  brightening: ['dark_circle_visibility'], // closest documented metric
  firmness: ['firmness_appearance'],
  calm_redness: ['redness_appearance'],
  pore_visibility: ['pore_visibility'],
  anti_aging: ['wrinkle_visibility'],
  oil_control: ['oiliness_balance'],
  texture: ['texture_smoothness'],
};

export type ScanVersion = {
  provider: string;
  provider_model_version: string | null;
  capture_protocol_version: string;
  metric_definition_version: string;
};

// Scores from different providers, models or capture protocols are never shown as one trend.
export const comparable = (a: ScanVersion, b: ScanVersion) =>
  a.provider === b.provider &&
  a.provider_model_version === b.provider_model_version &&
  a.capture_protocol_version === b.capture_protocol_version &&
  a.metric_definition_version === b.metric_definition_version;
