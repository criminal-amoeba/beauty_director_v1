import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { ScanError, toScanError } from './errors';

export const BUCKET = 'scan-images';
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MIN_PHOTO_SIDE = 480;

export type CapturedPhoto = { uri: string; width: number; height: number };

// Rejects photos the server would refuse anyway (bucket limit 10 MB; DermIQ wants a face, not a thumbnail).
export async function checkPhotoFile(photo: CapturedPhoto): Promise<void> {
  const info = await FileSystem.getInfoAsync(photo.uri);
  if (!info.exists || !info.size || info.size > MAX_PHOTO_BYTES) throw new ScanError('capture_failed');
  if (photo.width < MIN_PHOTO_SIDE || photo.height < MIN_PHOTO_SIDE) throw new ScanError('capture_failed');
}

// Uploads to the caller's own folder with the exact name shape the functions accept, then deletes the local file.
export async function uploadPhoto(userId: string, uri: string): Promise<string> {
  const path = `${userId}/${Crypto.randomUUID()}.jpg`;
  let base64: string;
  try {
    base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  } catch {
    throw new ScanError('capture_failed');
  }
  const { error } = await supabase.storage.from(BUCKET).upload(path, decode(base64), { contentType: 'image/jpeg', upsert: false });
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  if (error) throw new ScanError(/network|fetch/i.test(error.message) ? 'offline' : 'upload_failed', undefined, error.message);
  return path;
}

export const removePhoto = (path: string) =>
  supabase.storage.from(BUCKET).remove([path]).then(() => undefined, () => undefined);

export async function invokeScanFunction<T>(name: 'camera-test' | 'run-weekly-scan', body: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body, timeout: timeoutMs });
  if (error) throw await toScanError(error);
  return data as T;
}

export type WeeklyScanResult = { scan_id: string; thread_id: string };
// 90 s client timeout: the function's own deadline is 60 s (plan §5).
export const runWeeklyScan = (path: string) => invokeScanFunction<WeeklyScanResult>('run-weekly-scan', { image_path: path }, 90_000);

export type InFlightStatus = 'pending' | 'processing' | null;
// Stage poller: the user's own in-flight scan row (RLS select) drives the real progress labels.
export async function inFlightStatus(userId: string): Promise<InFlightStatus> {
  const { data } = await supabase.from('scans').select('status').eq('user_id', userId).in('status', ['pending', 'processing']).maybeSingle();
  return data?.status === 'pending' || data?.status === 'processing' ? data.status : null;
}
