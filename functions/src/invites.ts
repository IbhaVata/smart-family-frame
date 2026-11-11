/**
 * Family invite links — the simple way to add relatives. The owner taps "Invite" in the Family app and
 * shares a link (usually over WhatsApp); the relative opens it, signs in, and joins. Nobody has to be at
 * the TV, and there is no 10-minute code to type. Pairing codes remain only for connecting a new TV.
 */
import { randomBytes } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './lib/admin.js';
import { requireUid, requireOwner } from './lib/auth.js';
import { FAMILY_INVITE_TTL_MS, type Family, type FamilyInvite, type FamilyMember } from './shared/types.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export const createFamilyInvite = onCall<{ familyId: string }>(async (request) => {
  const uid = requireUid(request);
  const familyId = String(request.data?.familyId ?? '');
  if (!familyId) throw new HttpsError('invalid-argument', 'familyId is required.');
  const owner = await requireOwner(familyId, uid);
  const family = (await db.doc(`families/${familyId}`).get()).data() as Family | undefined;

  const token = randomBytes(16).toString('base64url'); // 128 bits: not guessable, unlike a 6-digit code
  const invite: FamilyInvite = {
    token, familyId, familyName: family?.name ?? 'Family', createdBy: uid, createdByName: owner.displayName,
    createdAt: Date.now(), expiresAt: Date.now() + FAMILY_INVITE_TTL_MS,
  };
  await db.doc(`familyInvites/${token}`).set(invite);
  return { token, familyName: invite.familyName, expiresAt: invite.expiresAt };
});

/** Reusable until it expires, so one link can be posted in a family WhatsApp group. */
export const claimFamilyInvite = onCall<{ token: string; displayName?: string }>(async (request) => {
  const uid = requireUid(request);
  const token = String(request.data?.token ?? '');
  if (!TOKEN_PATTERN.test(token)) throw new HttpsError('invalid-argument', 'This invite link is not valid.');
  const displayName = String(request.data?.displayName || request.auth?.token?.name || request.auth?.token?.email || 'Family member').slice(0, 60);

  return db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(db.doc(`familyInvites/${token}`));
    if (!inviteSnap.exists) throw new HttpsError('not-found', 'This invite link is not valid. Ask for a new one.');
    const invite = inviteSnap.data() as FamilyInvite;
    if (invite.expiresAt <= Date.now()) throw new HttpsError('deadline-exceeded', 'This invite link has expired. Ask for a new one.');

    // The inviter must still be the active owner, so a removed owner's old links stop working.
    const inviterSnap = await tx.get(db.doc(`families/${invite.familyId}/members/${invite.createdBy}`));
    const inviter = inviterSnap.data() as FamilyMember | undefined;
    if (!inviter || inviter.status !== 'ACTIVE' || inviter.role !== 'OWNER') {
      throw new HttpsError('failed-precondition', 'This invite link is no longer valid. Ask for a new one.');
    }

    const memberRef = db.doc(`families/${invite.familyId}/members/${uid}`);
    const memberSnap = await tx.get(memberRef);
    const existing = memberSnap.data() as FamilyMember | undefined;
    if (existing?.status === 'REVOKED') {
      throw new HttpsError('permission-denied', 'Your access to this family was removed. Ask the family owner to restore it.');
    }
    if (!existing) {
      const member: FamilyMember = { uid, role: 'MEMBER', displayName, status: 'ACTIVE', joinedAt: Date.now(), updatedAt: Date.now() };
      tx.set(memberRef, member);
    }
    tx.set(db.doc(`users/${uid}`), { uid, familyId: invite.familyId, displayName, updatedAt: Date.now() }, { merge: true });
    return { familyId: invite.familyId, familyName: invite.familyName, alreadyMember: Boolean(existing) };
  });
});
