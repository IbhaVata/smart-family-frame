import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, storage } from './lib/admin.js';
import { requireUid, requireActiveMember, requireFrame } from './lib/auth.js';
import { ALLOWED_PHOTO_MIME_TYPES, MAX_PHOTO_BYTES, type CloudPhoto, type PhotoSource } from './shared/types.js';

async function assertCurrentPhotoDevice(photo: CloudPhoto, familyId: string, deviceUid: string): Promise<void> {
  const frame = (await db.doc(`frames/${photo.frameId}`).get()).data() as { familyId?: string; deviceUid?: string } | undefined;
  if (photo.familyId !== familyId || photo.authorizedDeviceUid !== deviceUid || frame?.deviceUid !== deviceUid || frame.familyId !== familyId) {
    throw new HttpsError('permission-denied', 'Not authorized for this photo.');
  }
}

export interface CreatePhotoRecordArgs {
  familyId: string;
  frameId: string;
  albumId?: string | null;
  storagePath: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  uploadedBy: string;
  uploadedByName: string;
  source: PhotoSource;
}

/**
 * Core photo-record creation, shared by the `createPhotoRecord` callable (Family PWA uploads) and the
 * WhatsApp webhook (whatsapp/webhook.ts) — one implementation, so photo validation and the
 * `authorizedDeviceUid` derivation are never duplicated between the two entry points (V2 build §47's
 * "WhatsApp forwards into the SAME backend used by the Family PWA").
 */
export async function createPhotoRecordInternal(args: CreatePhotoRecordArgs): Promise<{ photoId: string }> {
  const frame = await requireFrame(args.frameId);
  if (frame.familyId !== args.familyId) throw new HttpsError('permission-denied', 'That Frame does not belong to this family.');
  if (!(ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(args.mimeType)) throw new HttpsError('invalid-argument', 'Unsupported photo type.');
  if (!Number.isFinite(args.size) || args.size <= 0 || args.size > MAX_PHOTO_BYTES) throw new HttpsError('invalid-argument', 'Photo is too large.');
  const expectedPrefix = `families/${args.familyId}/photos/${args.frameId}/`;
  if (!args.storagePath.startsWith(expectedPrefix)) throw new HttpsError('invalid-argument', 'Storage path does not match the expected location.');

  const photoRef = db.collection(`families/${args.familyId}/photos`).doc();
  const doc: CloudPhoto = {
    photoId: photoRef.id,
    familyId: args.familyId,
    frameId: args.frameId,
    authorizedDeviceUid: frame.deviceUid,
    albumId: args.albumId ?? null,
    storagePath: args.storagePath,
    filename: args.filename.slice(0, 200),
    mimeType: args.mimeType,
    size: args.size,
    width: args.width,
    height: args.height,
    uploadedBy: args.uploadedBy,
    uploadedByName: args.uploadedByName,
    uploadedAt: Date.now(),
    source: args.source,
    syncStatus: 'pending',
  };
  await photoRef.set(doc);
  return { photoId: photoRef.id };
}

interface CreatePhotoInput {
  familyId: string;
  frameId: string;
  albumId?: string | null;
  storagePath: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
}

/**
 * Callable used by the Family PWA after it has already uploaded a photo's bytes to Storage. The client
 * cannot write the Firestore metadata doc directly (firestore.rules denies it) — every field is
 * re-validated here rather than trusted from the request (V2 build §62).
 */
export const createPhotoRecord = onCall<CreatePhotoInput>(async (request) => {
  const uid = requireUid(request);
  const { familyId, frameId, storagePath, filename, mimeType, size } = request.data ?? ({} as CreatePhotoInput);
  if (!familyId || !frameId || !storagePath || !filename) throw new HttpsError('invalid-argument', 'Missing required fields.');
  const member = await requireActiveMember(familyId, uid);
  return createPhotoRecordInternal({
    familyId, frameId, albumId: request.data.albumId ?? null, storagePath, filename, mimeType, size,
    width: typeof request.data.width === 'number' ? request.data.width : undefined,
    height: typeof request.data.height === 'number' ? request.data.height : undefined,
    uploadedBy: uid, uploadedByName: member.displayName, source: 'pwa',
  });
});

/** Called by the FRAME after it has successfully downloaded and locally stored a photo. Best-effort
 *  from the client's point of view (V2 build §33 step 8) — the frame keeps the photo locally even if
 *  this call fails, it just retries confirmation on the next sync. */
export const confirmPhotoSynced = onCall<{ familyId: string; photoId: string }>(async (request) => {
  const deviceUid = requireUid(request);
  const { familyId, photoId } = request.data ?? {};
  if (!familyId || !photoId) throw new HttpsError('invalid-argument', 'familyId and photoId are required.');
  const ref = db.doc(`families/${familyId}/photos/${photoId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That photo was not found.');
  const photo = snap.data() as CloudPhoto;
  await assertCurrentPhotoDevice(photo, familyId, deviceUid);
  await ref.update({ syncStatus: 'synced', downloadConfirmedAt: Date.now() });
  return { ok: true };
});

/** Downloads the bytes for a paired Frame only when its browser cannot complete a direct Storage XHR.
 *  The normal path remains Storage Rules -> Frame; this authenticated callable is the transport
 *  fallback and applies the same target-device and size checks before reading the same Storage object. */
export const getPhotoDownloadUrl = onCall<{ familyId: string; photoId: string }>(async (request) => {
  const deviceUid = requireUid(request);
  const { familyId, photoId } = request.data ?? {};
  if (!familyId || !photoId) throw new HttpsError('invalid-argument', 'familyId and photoId are required.');
  const ref = db.doc(`families/${familyId}/photos/${photoId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That photo was not found.');
  const photo = snap.data() as CloudPhoto;
  await assertCurrentPhotoDevice(photo, familyId, deviceUid);
  if (photo.size <= 0 || photo.size > MAX_PHOTO_BYTES) throw new HttpsError('failed-precondition', 'Photo size is invalid.');
  const [bytes] = await storage.bucket().file(photo.storagePath).download();
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw new HttpsError('data-loss', 'Stored photo exceeds the allowed size.');
  return { bytesBase64: bytes.toString('base64') };
});
