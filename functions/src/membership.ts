import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './lib/admin.js';
import { requireUid, requireOwner } from './lib/auth.js';
import type { FamilyMember } from './shared/types.js';

/** OWNER revokes a member's cloud access. Their already-downloaded content on any Frame is untouched
 *  (V2 build §25) — revocation only removes FUTURE Firestore/Storage access via security rules, which
 *  check `status === 'ACTIVE'` on every read/write. */
export const revokeMember = onCall<{ familyId: string; memberUid: string }>(async (request) => {
  const uid = requireUid(request);
  const familyId = String(request.data?.familyId ?? '');
  const memberUid = String(request.data?.memberUid ?? '');
  if (!familyId || !memberUid) throw new HttpsError('invalid-argument', 'familyId and memberUid are required.');
  await requireOwner(familyId, uid);
  if (memberUid === uid) throw new HttpsError('failed-precondition', 'The owner cannot revoke themselves.');

  const memberRef = db.doc(`families/${familyId}/members/${memberUid}`);
  const snap = await memberRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That member was not found in this family.');
  const member = snap.data() as FamilyMember;
  if (member.role === 'OWNER') throw new HttpsError('failed-precondition', 'The family owner cannot be revoked.');

  await memberRef.update({ status: 'REVOKED', updatedAt: Date.now() });
  // Also unlink any WhatsApp senders mapped to this member so a revoked person's WhatsApp messages are
  // rejected going forward too (not just PWA access) — see whatsapp/webhook.ts's sender lookup.
  const senders = await db.collection('whatsappSenders').where('uid', '==', memberUid).where('familyId', '==', familyId).get();
  await Promise.all(senders.docs.map((d) => d.ref.delete()));
  return { ok: true };
});

/** OWNER disconnects a Frame from the cloud (V2 build §73). Local content on the Frame is never touched
 *  by this — only cloud-side association and future sync are stopped. */
export const disconnectFrame = onCall<{ frameId: string }>(async (request) => {
  const uid = requireUid(request);
  const frameId = String(request.data?.frameId ?? '');
  if (!frameId) throw new HttpsError('invalid-argument', 'frameId is required.');

  const frameRef = db.doc(`frames/${frameId}`);
  const snap = await frameRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'That Frame does not exist.');
  const frame = snap.data() as { familyId: string | null; deviceUid: string };
  if (!frame.familyId) throw new HttpsError('failed-precondition', 'This Frame is not connected to a family.');
  await requireOwner(frame.familyId, uid);

  await frameRef.update({ familyId: null, familyName: null, updatedAt: Date.now(), status: 'OFFLINE' });
  await db.doc(`frameDeviceIndex/${frame.deviceUid}`).delete();
  return { ok: true };
});
