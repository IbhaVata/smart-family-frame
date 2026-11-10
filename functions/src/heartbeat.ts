import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './lib/admin.js';
import { requireUid } from './lib/auth.js';

/** Server-side throttle: a Frame's heartbeat is written at most once per this interval, regardless of
 *  how often the client calls it (defense in depth beyond the client's own 5-minute timer — V2 build §67). */
const MIN_INTERVAL_MS = 4 * 60_000;

export const frameHeartbeat = onCall<{ frameId: string }>(async (request) => {
  const deviceUid = requireUid(request);
  const frameId = String(request.data?.frameId ?? '');
  if (!frameId) throw new HttpsError('invalid-argument', 'frameId is required.');
  const ref = db.doc(`frames/${frameId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That Frame does not exist.');
  const frame = snap.data() as { deviceUid: string; lastSeenAt: number };
  if (frame.deviceUid !== deviceUid) throw new HttpsError('permission-denied', 'Not authorized for this Frame.');
  if (Date.now() - (frame.lastSeenAt ?? 0) < MIN_INTERVAL_MS) return { ok: true, throttled: true };
  await ref.update({ lastSeenAt: Date.now(), status: 'ONLINE' });
  return { ok: true, throttled: false };
});
