// Dev-only Camera Test: photo → DermIQ (mock or real) → raw + normalized result. Writes nothing to the
// database and always deletes the photo. Refuses to run unless CAMERA_TEST_ENABLED=true (dev project only).
import type { Dermiq } from '../_shared/adapters/dermiq.ts';
import { normalizeResult, type Normalized } from '../_shared/adapters/dermiq-normalize.ts';
import { isOwnImagePath, ScanError } from '../_shared/codes.ts';

export type CameraTestDeps = {
  enabled: boolean;
  getUser(jwt: string): Promise<{ id: string } | null>;
  downloadPhoto(path: string): Promise<Blob | null>;
  deletePhoto(path: string): Promise<void>;
  dermiq: Dermiq;
  logRaw?: boolean; // dev-only: dump the provider result (no PII in it) so a real sample can be read from the logs
  timeoutMs?: number;
};

export type HandlerResult = { status: number; body: unknown };
export type CameraTestResponse = {
  raw: unknown;
  normalized: Normalized;
  model_version: string;
  elapsed_ms: number;
};

const fail = (status: number, code: string): HandlerResult => ({ status, body: { error: code } });

export async function handleCameraTest(req: { jwt: string | null; body: unknown }, deps: CameraTestDeps): Promise<HandlerResult> {
  if (!deps.enabled) return fail(403, 'disabled');
  if (!req.jwt) return fail(401, 'unauthorized');
  const user = await deps.getUser(req.jwt);
  if (!user) return fail(401, 'unauthorized');

  const path = (req.body as { image_path?: unknown } | null)?.image_path;
  if (!isOwnImagePath(user.id, path)) return fail(400, 'invalid_path');

  const started = Date.now();
  try {
    const photo = await deps.downloadPhoto(path);
    if (!photo) return fail(404, 'photo_missing');
    const raw = await deps.dermiq.analyze(photo, AbortSignal.timeout(deps.timeoutMs ?? 45_000));
    if (deps.logRaw) console.log(`camera-test raw: ${JSON.stringify(raw)}`);
    const normalized = normalizeResult(raw);
    if (!normalized.ok) console.warn(`camera-test: invalid result (${normalized.reason})`);
    const body: CameraTestResponse = { raw, normalized, model_version: deps.dermiq.modelVersion, elapsed_ms: Date.now() - started };
    return { status: 200, body };
  } catch (e) {
    if (e instanceof ScanError) {
      console.error(`camera-test: ${e.code}`);
      return fail(e.status, e.code);
    }
    console.error('camera-test: unexpected', (e as Error).name);
    return fail(500, 'provider_failed');
  } finally {
    await deps.deletePhoto(path).catch(() => console.error('camera-test: photo delete failed'));
  }
}
