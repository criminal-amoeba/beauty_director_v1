// What run-weekly-scan needs from the database, as a small interface so the handler is tested against a
// fake. The Supabase implementation lives in run-weekly-scan/index.ts (Deno, service role).
import type { ErrorCode, Metric } from './codes.ts';
import type { ScanVersion } from './rules/goals.ts';
import type { Budget, Severity } from './rules/review.ts';

export type PendingScan = { id: string } | 'in_progress';

export type ScanContext = {
  goals: string[];
  budget: Budget | null;
  reactions: { ingredient: string | null; severity: Severity }[];
  ownedCategories: string[];
  routineSteps: { am: string[]; pm: string[] };
  persona: string;
  locale: string;
  // The latest succeeded scan before this one, with its metrics; comparability is decided by the handler.
  previous: (ScanVersion & { metrics: Metric[] }) | null;
};

export type ReviewMessage = { content: string; model: string | null; promptTokens: number | null; completionTokens: number | null };

export type ScanDb = {
  hasPhotoConsent(userId: string): Promise<boolean>;
  // Marks this user's pending/processing scans created before `before` failed(stale); returns their photo paths.
  sweepStale(userId: string, before: string): Promise<string[]>;
  lastSucceededAt(userId: string): Promise<string | null>;
  insertPending(row: { user_id: string; provider: string; capture_protocol_version: string; image_path: string }): Promise<PendingScan>;
  markProcessing(scanId: string, patch: { provider_job_id: string; provider_raw: unknown; provider_model_version: string }): Promise<void>;
  insertMetrics(scanId: string, userId: string, metrics: Metric[]): Promise<void>;
  deleteMetrics(scanId: string): Promise<void>;
  loadContext(userId: string): Promise<ScanContext>;
  insertReview(scanId: string, userId: string, message: ReviewMessage): Promise<{ threadId: string }>;
  markSucceeded(scanId: string): Promise<void>;
  markFailed(scanId: string, code: ErrorCode): Promise<void>;
};
