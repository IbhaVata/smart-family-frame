/**
 * Frame <-> Family pairing (V2 build §20-23). Two callable functions:
 *
 *  - createPairingCode: called by an authenticated FRAME device. Self-registers the frame doc on first
 *    call, then mints a short-lived one-time code.
 *  - claimPairingCode: called by an authenticated FAMILY USER (from the Family PWA). Atomically
 *    consumes the code inside a Firestore transaction so two people racing to claim the same code can
 *    never both succeed (V2 build §22, §85 "concurrent claim").
 *
 * Claim resolves the target family with this logic (see V2_ARCHITECTURE.md §24-26 for the scenarios):
 *   - Frame already belongs to a family (a SECOND+ person pairing to an already-connected Frame, e.g.
 *     Acceptance Test 3) -> claimer joins that family as a MEMBER (or is a no-op if already in it).
 *   - Frame is unpaired and the claimer already owns a family (pairing an ADDITIONAL frame, e.g.
 *     "Living Room" + "Parents", Acceptance Test 4) -> the frame is attached to that family.
 *   - Frame is unpaired and the claimer owns no family yet -> a new family is created with them as OWNER.
 *   - Frame is unpaired and the claimer belongs to a family only as a MEMBER -> rejected: pairing a new
 *     Frame is an OWNER-only action (V2 build §16).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './lib/admin.js';
import { requireUid } from './lib/auth.js';
import { generateSixDigitCode } from './lib/codes.js';
import { PAIRING_CODE_TTL_MS, type CloudFrame, type Family, type FamilyMember, type PairingCode } from './shared/types.js';

const MAX_CODE_ATTEMPTS = 5;

export const createPairingCode = onCall<{ frameId: string; frameName?: string }>(async (request) => {
  const deviceUid = requireUid(request);
  const frameId = String(request.data?.frameId ?? '').trim();
  if (!/^FRAME-[A-Z0-9]{6}$/.test(frameId)) throw new HttpsError('invalid-argument', 'Invalid Frame ID.');
  const frameName = String(request.data?.frameName ?? 'Smart Frame').slice(0, 60);

  const frameRef = db.doc(`frames/${frameId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(frameRef);
    if (!snap.exists) {
      const fresh: CloudFrame = {
        frameId, familyId: null as unknown as string, familyName: null, name: frameName, ownerUid: '', deviceUid,
        createdAt: Date.now(), updatedAt: Date.now(), lastSeenAt: Date.now(), softwareVersion: '2.0.0', status: 'ONLINE',
      };
      tx.set(frameRef, fresh);
    } else {
      const data = snap.data() as CloudFrame;
      if (data.deviceUid !== deviceUid) {
        throw new HttpsError('permission-denied', 'This Frame ID is already registered to a different device.');
      }
    }
  });

  let code = '';
  const codeRef = () => db.doc(`pairingCodes/${code}`);
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    code = generateSixDigitCode();
    const created = await db.runTransaction(async (tx) => {
      const existing = await tx.get(codeRef());
      if (existing.exists && !(existing.data() as PairingCode).used && (existing.data() as PairingCode).expiresAt > Date.now()) {
        return false; // still-active code collision (astronomically unlikely) — retry with a new code
      }
      const doc: PairingCode = { code, frameId, createdAt: Date.now(), expiresAt: Date.now() + PAIRING_CODE_TTL_MS, used: false };
      tx.set(codeRef(), doc);
      return true;
    });
    if (created) return { code, expiresAt: Date.now() + PAIRING_CODE_TTL_MS };
  }
  throw new HttpsError('resource-exhausted', 'Could not generate a pairing code. Try again.');
});

export const claimPairingCode = onCall<{ code: string; displayName?: string }>(async (request) => {
  const uid = requireUid(request);
  const code = String(request.data?.code ?? '').trim();
  if (!/^\d{6}$/.test(code)) throw new HttpsError('invalid-argument', 'Enter the 6-digit code shown on the Frame.');
  const displayName = String(request.data?.displayName || request.auth?.token.name || 'Family member').slice(0, 60);

  return db.runTransaction(async (tx) => {
    const codeRef = db.doc(`pairingCodes/${code}`);
    const codeSnap = await tx.get(codeRef);
    if (!codeSnap.exists) throw new HttpsError('not-found', 'That code was not found. Check the digits and try again.');
    const codeData = codeSnap.data() as PairingCode;
    if (codeData.used) throw new HttpsError('failed-precondition', 'That code has already been used.');
    if (codeData.expiresAt <= Date.now()) throw new HttpsError('deadline-exceeded', 'That code has expired. Generate a new one on the Frame.');

    const frameRef = db.doc(`frames/${codeData.frameId}`);
    const frameSnap = await tx.get(frameRef);
    if (!frameSnap.exists) throw new HttpsError('not-found', 'That Frame no longer exists.');
    const frame = frameSnap.data() as CloudFrame;

    const userRef = db.doc(`users/${uid}`);
    const userSnap = await tx.get(userRef);
    const existingFamilyId = (userSnap.data() as { familyId?: string } | undefined)?.familyId ?? null;

    let familyId: string;
    let familyName: string;

    if (frame.familyId) {
      // Someone is already connected to this Frame; the claimer joins that same family.
      familyId = frame.familyId;
      const familySnap = await tx.get(db.doc(`families/${familyId}`));
      const family = familySnap.data() as Family | undefined;
      familyName = family?.name ?? 'Family';
      const memberRef = db.doc(`families/${familyId}/members/${uid}`);
      const memberSnap = await tx.get(memberRef);
      if (!memberSnap.exists) {
        const member: FamilyMember = { uid, role: 'MEMBER', displayName, status: 'ACTIVE', joinedAt: Date.now(), updatedAt: Date.now() };
        tx.set(memberRef, member);
      } else if ((memberSnap.data() as FamilyMember).status === 'REVOKED') {
        // Codes are minted by the Frame device, not the owner, so anyone who can see the screen could
        // otherwise undo the owner's revocation. Re-admitting a revoked member stays an owner decision.
        throw new HttpsError('permission-denied', 'Your access to this family was removed. Ask the family owner to restore it.');
      }
    } else if (existingFamilyId) {
      const memberRef = db.doc(`families/${existingFamilyId}/members/${uid}`);
      const memberSnap = await tx.get(memberRef);
      const member = memberSnap.data() as FamilyMember | undefined;
      if (!member || member.role !== 'OWNER') {
        throw new HttpsError('permission-denied', 'Only the family owner can connect a new Frame.');
      }
      familyId = existingFamilyId;
      const familySnap = await tx.get(db.doc(`families/${familyId}`));
      familyName = (familySnap.data() as Family | undefined)?.name ?? 'Family';
      tx.update(frameRef, { familyId, familyName, ownerUid: uid, updatedAt: Date.now() });
      tx.set(db.doc(`frameDeviceIndex/${frame.deviceUid}`), { deviceUid: frame.deviceUid, frameId: codeData.frameId, familyId });
    } else {
      const newFamilyRef = db.collection('families').doc();
      familyId = newFamilyRef.id;
      familyName = `${displayName}'s Family`;
      const family: Family = { id: familyId, name: familyName, ownerUid: uid, createdAt: Date.now(), updatedAt: Date.now() };
      tx.set(newFamilyRef, family);
      const member: FamilyMember = { uid, role: 'OWNER', displayName, status: 'ACTIVE', joinedAt: Date.now(), updatedAt: Date.now() };
      tx.set(db.doc(`families/${familyId}/members/${uid}`), member);
      tx.update(frameRef, { familyId, familyName, ownerUid: uid, updatedAt: Date.now() });
      tx.set(db.doc(`frameDeviceIndex/${frame.deviceUid}`), { deviceUid: frame.deviceUid, frameId: codeData.frameId, familyId });
    }

    tx.set(userRef, { uid, familyId, displayName, updatedAt: Date.now() }, { merge: true });
    tx.update(codeRef, { used: true, usedBy: uid, usedAt: Date.now() });

    return { frameId: codeData.frameId, frameName: frame.name, familyId, familyName };
  });
});
