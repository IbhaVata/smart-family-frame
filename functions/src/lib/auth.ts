import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { db } from './admin.js';
import type { FamilyMember } from '../shared/types.js';

/** Throws if the caller is not authenticated. Returns their uid. Never trust a client-supplied uid instead. */
export function requireUid(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign-in required.');
  return uid;
}

export async function requireActiveMember(familyId: string, uid: string): Promise<FamilyMember> {
  const snap = await db.doc(`families/${familyId}/members/${uid}`).get();
  const data = snap.data() as FamilyMember | undefined;
  if (!snap.exists || !data || data.status !== 'ACTIVE') {
    throw new HttpsError('permission-denied', 'You do not have access to this family.');
  }
  return data;
}

export async function requireOwner(familyId: string, uid: string): Promise<FamilyMember> {
  const member = await requireActiveMember(familyId, uid);
  if (member.role !== 'OWNER') {
    throw new HttpsError('permission-denied', 'Only the family owner can do this.');
  }
  return member;
}

/** Loads the frame doc, throwing a clean error if it does not exist — never trust a client-supplied frameId's shape. */
export async function requireFrame(frameId: string) {
  const snap = await db.doc(`frames/${frameId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'That Frame does not exist.');
  return snap.data() as { frameId: string; familyId: string | null; deviceUid: string; [k: string]: unknown };
}
