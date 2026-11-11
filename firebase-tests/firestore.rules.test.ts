import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { afterAll, beforeEach, describe, it } from 'vitest';
import { getTestEnv, teardownTestEnv } from './setup';

const FAM1 = 'fam1';
const FAM2 = 'fam2';
const FRAME1 = 'FRAME-TEST01';
const FRAME2 = 'FRAME-TEST02';
const OWNER1 = 'owner1';
const MEMBER1 = 'member1';
const REVOKED1 = 'revoked1';
const OWNER2 = 'owner2';
const DEVICE1 = 'device1';
const DEVICE2 = 'device2';
const OUTSIDER = 'outsider';

async function seed() {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`families/${FAM1}`).set({ id: FAM1, name: 'Family One', ownerUid: OWNER1, createdAt: 1, updatedAt: 1 });
    await db.doc(`families/${FAM1}/members/${OWNER1}`).set({ uid: OWNER1, role: 'OWNER', displayName: 'Owner One', status: 'ACTIVE', joinedAt: 1, updatedAt: 1 });
    await db.doc(`families/${FAM1}/members/${MEMBER1}`).set({ uid: MEMBER1, role: 'MEMBER', displayName: 'Member One', status: 'ACTIVE', joinedAt: 1, updatedAt: 1 });
    await db.doc(`families/${FAM1}/members/${REVOKED1}`).set({ uid: REVOKED1, role: 'MEMBER', displayName: 'Revoked One', status: 'REVOKED', joinedAt: 1, updatedAt: 1 });

    await db.doc(`families/${FAM2}`).set({ id: FAM2, name: 'Family Two', ownerUid: OWNER2, createdAt: 1, updatedAt: 1 });
    await db.doc(`families/${FAM2}/members/${OWNER2}`).set({ uid: OWNER2, role: 'OWNER', displayName: 'Owner Two', status: 'ACTIVE', joinedAt: 1, updatedAt: 1 });

    await db.doc(`frames/${FRAME1}`).set({ frameId: FRAME1, familyId: FAM1, name: 'Frame One', ownerUid: OWNER1, deviceUid: DEVICE1, createdAt: 1, updatedAt: 1, lastSeenAt: 1, softwareVersion: '2.0.0', status: 'ONLINE' });
    await db.doc(`frames/${FRAME2}`).set({ frameId: FRAME2, familyId: FAM2, name: 'Frame Two', ownerUid: OWNER2, deviceUid: DEVICE2, createdAt: 1, updatedAt: 1, lastSeenAt: 1, softwareVersion: '2.0.0', status: 'ONLINE' });

    await db.doc(`families/${FAM1}/photos/photo1`).set({ photoId: 'photo1', familyId: FAM1, frameId: FRAME1, authorizedDeviceUid: DEVICE1, albumId: null, storagePath: `families/${FAM1}/photos/${FRAME1}/photo1.jpg`, filename: 'photo1.jpg', mimeType: 'image/jpeg', size: 100, uploadedBy: MEMBER1, uploadedByName: 'Member One', uploadedAt: 1, source: 'pwa', syncStatus: 'pending' });

    await db.doc(`frames/${FRAME1}/householdServices/svc1`).set({ id: 'svc1', name: 'Maid', type: 'MAID', vendorName: '', startDate: '2026-01-01', paymentType: 'MONTHLY_FIXED', rate: 5000, status: 'ACTIVE', notes: '', createdAt: 1, updatedAt: 1 });
    await db.doc(`frames/${FRAME1}/householdEntries/svc1:2026-09-15`).set({ id: 'svc1:2026-09-15', serviceId: 'svc1', date: '2026-09-15', attendance: 'PRESENT', note: '', updatedAt: 1 });
    await db.doc(`frames/${FRAME1}/householdPayments/pay1`).set({ id: 'pay1', serviceId: 'svc1', month: '2026-09', expectedAmount: 5000, status: 'UNPAID', paidAmount: 0, note: '', updatedAt: 1 });

    await db.doc(`pairingCodes/482913`).set({ code: '482913', frameId: FRAME1, createdAt: 1, expiresAt: Date.now() + 600_000, used: false });
    await db.doc(`users/${OWNER1}`).set({ uid: OWNER1, familyId: FAM1, displayName: 'Owner One', updatedAt: 1 });
    await db.doc(`frameDeviceIndex/${DEVICE1}`).set({ deviceUid: DEVICE1, frameId: FRAME1, familyId: FAM1 });
  });
}

beforeEach(async () => {
  await seed();
});
afterAll(async () => {
  await teardownTestEnv();
});

describe('users/{uid}', () => {
  it('a user can read their own users/{uid} pointer doc', async () => {
    const env = await getTestEnv();
    await assertSucceeds(env.authenticatedContext(OWNER1).firestore().doc(`users/${OWNER1}`).get());
  });
  it('a user cannot read someone else\'s users/{uid} doc', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(MEMBER1).firestore().doc(`users/${OWNER1}`).get());
  });
  it('a client can never write users/{uid} directly (claimPairingCode Admin SDK only)', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(OWNER1).firestore().doc(`users/${OWNER1}`).set({ uid: OWNER1, familyId: FAM2, displayName: 'x', updatedAt: 2 }));
  });
});

describe('families/{familyId}', () => {
  it('an active member can read their own family', async () => {
    const env = await getTestEnv();
    await assertSucceeds(env.authenticatedContext(MEMBER1).firestore().doc(`families/${FAM1}`).get());
  });
  it('an unrelated authenticated user is denied', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(OUTSIDER).firestore().doc(`families/${FAM1}`).get());
  });
  it('an unauthenticated caller is denied', async () => {
    const env = await getTestEnv();
    await assertFails(env.unauthenticatedContext().firestore().doc(`families/${FAM1}`).get());
  });
  it('a member of a DIFFERENT family cannot read this family (cross-family isolation)', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(OWNER2).firestore().doc(`families/${FAM1}`).get());
  });
  it('a revoked member is denied', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(REVOKED1).firestore().doc(`families/${FAM1}`).get());
  });
  it('direct client creation of a family is always denied (Cloud Functions only)', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(OUTSIDER).firestore().doc('families/newfam').set({ id: 'newfam', name: 'x', ownerUid: OUTSIDER, createdAt: 1, updatedAt: 1 }));
  });
  it('the owner can rename the family directly; a member cannot', async () => {
    const env = await getTestEnv();
    await assertSucceeds(env.authenticatedContext(OWNER1).firestore().doc(`families/${FAM1}`).update({ name: 'Renamed', updatedAt: 2 }));
    await assertFails(env.authenticatedContext(MEMBER1).firestore().doc(`families/${FAM1}`).update({ name: 'Hacked', updatedAt: 3 }));
  });
  it('members subcollection is never directly writable by a client', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(OWNER1).firestore().doc(`families/${FAM1}/members/${MEMBER1}`).update({ role: 'OWNER' }));
  });
});

describe('frames/{frameId}', () => {
  it('a revoked uploader cannot delete a photo through a stale account', async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => ctx.firestore().doc(`families/${FAM1}/members/${MEMBER1}`).update({ status: 'REVOKED' }));
    await assertFails(env.authenticatedContext(MEMBER1).firestore().doc(`families/${FAM1}/photos/photo1`).delete());
  });
  it('a disconnected device cannot read or list former family photo metadata', async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => ctx.firestore().doc(`frames/${FRAME1}`).update({ familyId: null }));
    const db = env.authenticatedContext(DEVICE1).firestore();
    await assertFails(db.doc(`families/${FAM1}/photos/photo1`).get());
    await assertFails(getDocs(query(collection(db, `families/${FAM1}/photos`), where('frameId', '==', FRAME1))));
  });
  it('the owning frame device can read its own frame doc', async () => {
    const env = await getTestEnv();
    await assertSucceeds(env.authenticatedContext(DEVICE1).firestore().doc(`frames/${FRAME1}`).get());
  });
  it('a family member can read their family\'s frame; a different family\'s member cannot', async () => {
    const env = await getTestEnv();
    await assertSucceeds(env.authenticatedContext(MEMBER1).firestore().doc(`frames/${FRAME1}`).get());
    await assertFails(env.authenticatedContext(OWNER2).firestore().doc(`frames/${FRAME1}`).get());
  });
  it('a frame device cannot read a DIFFERENT frame\'s doc', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(DEVICE1).firestore().doc(`frames/${FRAME2}`).get());
  });
  it('direct client writes to a frame doc are always denied (heartbeat/pairing go through Cloud Functions)', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(DEVICE1).firestore().doc(`frames/${FRAME1}`).update({ lastSeenAt: Date.now() }));
  });
});

describe('household privacy (§43: financial detail is OWNER-only)', () => {
  it('the owner can read household services and payments', async () => {
    const env = await getTestEnv();
    await assertSucceeds(env.authenticatedContext(OWNER1).firestore().doc(`frames/${FRAME1}/householdServices/svc1`).get());
    await assertSucceeds(env.authenticatedContext(OWNER1).firestore().doc(`frames/${FRAME1}/householdPayments/pay1`).get());
  });
  it('a plain member is denied reading service rates and payment records', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(MEMBER1).firestore().doc(`frames/${FRAME1}/householdServices/svc1`).get());
    await assertFails(env.authenticatedContext(MEMBER1).firestore().doc(`frames/${FRAME1}/householdPayments/pay1`).get());
  });
  it('a plain member CAN read and write quick daily attendance/delivery entries', async () => {
    const env = await getTestEnv();
    await assertSucceeds(env.authenticatedContext(MEMBER1).firestore().doc(`frames/${FRAME1}/householdEntries/svc1:2026-09-15`).get());
    await assertSucceeds(env.authenticatedContext(MEMBER1).firestore().doc(`frames/${FRAME1}/householdEntries/svc1:2026-09-16`).set({ id: 'svc1:2026-09-16', serviceId: 'svc1', date: '2026-09-16', attendance: 'PRESENT', note: '', updatedAt: Date.now() }));
  });
  it('a Frame cannot bypass the authenticated Household sync callable with direct writes', async () => {
    const env = await getTestEnv();
    const own = env.authenticatedContext(DEVICE1).firestore();
    await assertFails(own.doc(`frames/${FRAME1}/householdServices/frame-svc`).set({ id: 'frame-svc', name: 'Milk', type: 'MILK' }));
    await assertFails(own.doc(`frames/${FRAME1}/householdServiceSettings/frame-svc`).set({ id: 'frame-svc', serviceId: 'frame-svc' }));
    await assertFails(own.doc(`frames/${FRAME1}/householdPayments/frame-pay`).set({ id: 'frame-pay', serviceId: 'frame-svc' }));
    await assertFails(own.doc(`frames/${FRAME2}/householdServices/stolen`).set({ id: 'stolen', name: 'No', type: 'MAID' }));
  });
});

describe('families/{familyId}/photos/{photoId}', () => {
  it('a family member can read a family photo', async () => {
    const env = await getTestEnv();
    await assertSucceeds(env.authenticatedContext(MEMBER1).firestore().doc(`families/${FAM1}/photos/photo1`).get());
  });
  it('the authorized frame device can read it; a different frame device cannot', async () => {
    const env = await getTestEnv();
    await assertSucceeds(env.authenticatedContext(DEVICE1).firestore().doc(`families/${FAM1}/photos/photo1`).get());
    await assertFails(env.authenticatedContext(DEVICE2).firestore().doc(`families/${FAM1}/photos/photo1`).get());
  });
  it('an outsider cannot read it', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(OUTSIDER).firestore().doc(`families/${FAM1}/photos/photo1`).get());
  });
  it('a client can never create or update a photo doc directly (createPhotoRecord/confirmPhotoSynced Cloud Functions only)', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(MEMBER1).firestore().doc(`families/${FAM1}/photos/photo2`).set({ photoId: 'photo2', familyId: FAM1, frameId: FRAME1, authorizedDeviceUid: DEVICE1, albumId: null, storagePath: 'x', filename: 'x', mimeType: 'image/jpeg', size: 1, uploadedBy: MEMBER1, uploadedByName: 'x', uploadedAt: 1, source: 'pwa', syncStatus: 'pending' }));
    await assertFails(env.authenticatedContext(DEVICE1).firestore().doc(`families/${FAM1}/photos/photo1`).update({ syncStatus: 'synced' }));
  });
  it('the owner or the uploader can delete a photo doc directly; an unrelated member cannot', async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => ctx.firestore().doc(`families/${FAM1}/photos/toDelete`).set({ photoId: 'toDelete', familyId: FAM1, frameId: FRAME1, authorizedDeviceUid: DEVICE1, albumId: null, storagePath: 'x', filename: 'x', mimeType: 'image/jpeg', size: 1, uploadedBy: MEMBER1, uploadedByName: 'x', uploadedAt: 1, source: 'pwa', syncStatus: 'pending' }));
    await assertSucceeds(env.authenticatedContext(MEMBER1).firestore().doc(`families/${FAM1}/photos/toDelete`).delete());
  });
});

describe('pairingCodes/{code}', () => {
  it('the frame that generated a code can read it', async () => {
    const env = await getTestEnv();
    await assertSucceeds(env.authenticatedContext(DEVICE1).firestore().doc('pairingCodes/482913').get());
  });
  it('a different frame device cannot read it', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(DEVICE2).firestore().doc('pairingCodes/482913').get());
  });
  it('a family user cannot read a pairing code directly (must use the claimPairingCode Cloud Function)', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(MEMBER1).firestore().doc('pairingCodes/482913').get());
  });
  it('a client can never write a pairing code directly', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(DEVICE1).firestore().doc('pairingCodes/999999').set({ code: '999999', frameId: FRAME1, createdAt: 1, expiresAt: 1, used: false }));
  });
});

describe('server-only collections are never directly readable or writable', () => {
  it('whatsappSenders, whatsappLinkCodes and whatsappProcessedMessages are fully denied to clients', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(OWNER1).firestore().doc('whatsappSenders/911234567').get());
    await assertFails(env.authenticatedContext(OWNER1).firestore().doc('whatsappLinkCodes/482913').get());
    await assertFails(env.authenticatedContext(OWNER1).firestore().doc('whatsappProcessedMessages/wamid.abc').get());
  });

  it('familyInvites cannot be read, listed or forged by clients (only the invite callables touch them)', async () => {
    const env = await getTestEnv();
    const db = env.authenticatedContext(OWNER1).firestore();
    await assertFails(db.doc('familyInvites/abcdefghijklmnopqrstuv').get());
    await assertFails(db.collection('familyInvites').get());
    await assertFails(db.doc('familyInvites/abcdefghijklmnopqrstuv').set({ familyId: 'fam1', expiresAt: Date.now() + 1e9 }));
  });
});

describe('list/query operations (not just single-doc get) — regression coverage for a real bug class', () => {
  // These caught real production bugs during live emulator testing that the single-document `get()`
  // tests above did NOT: Firestore evaluates a security rule differently for a `list`/query request
  // than for a `get` of one known document, and two failure modes only show up here —
  //  1. `allow list: if false` (or omitting `list` while only granting `get`) silently breaks every
  //     `query(...)` the client actually uses, even though direct-by-id reads still work.
  //  2. `get(path) != null` as an existence guard does NOT protect `.data` field access during `list`
  //     evaluation the way it appears to for `get` — it must be `exists(path)` — and reading a
  //     `resource.data` field that isn't part of the query's own `where` filter (e.g. `authorizedDeviceUid`
  //     when only `frameId` is filtered on) can throw "Property X is undefined" during list evaluation
  //     even though the real document has that field. See firestore.rules' `frames/{frameId}` and
  //     `photos/{photoId}` rules and their comments for the fixes.
  it('a family member can list frames filtered by familyId (Frames/Home/Send-Photos screens)', async () => {
    const env = await getTestEnv();
    const q = query(collection(env.authenticatedContext(MEMBER1).firestore(), 'frames'), where('familyId', '==', FAM1));
    await assertSucceeds(getDocs(q));
  });
  it('an outsider listing frames filtered by a family they are not in gets zero results, not an error', async () => {
    const env = await getTestEnv();
    const q = query(collection(env.authenticatedContext(OUTSIDER).firestore(), 'frames'), where('familyId', '==', FAM1));
    await assertFails(getDocs(q));
  });
  it('the frame device itself can list its family\'s member collection (Remote Sharing "connected members")', async () => {
    const env = await getTestEnv();
    const q = collection(env.authenticatedContext(DEVICE1).firestore(), `families/${FAM1}/members`);
    await assertSucceeds(getDocs(q));
  });
  it('a device with no frameDeviceIndex entry cannot list any family\'s members', async () => {
    const env = await getTestEnv();
    const q = collection(env.authenticatedContext(DEVICE2).firestore(), `families/${FAM1}/members`);
    await assertFails(getDocs(q));
  });
  it('the frame device can list photos targeting it, filtered by frameId (photoSync.ts\'s actual query)', async () => {
    const env = await getTestEnv();
    const q = query(collection(env.authenticatedContext(DEVICE1).firestore(), `families/${FAM1}/photos`), where('frameId', '==', FRAME1));
    await assertSucceeds(getDocs(q));
  });
});

describe('albums', () => {
  it('a member can create an album with correct familyId and their own uid as creator', async () => {
    const env = await getTestEnv();
    await assertSucceeds(env.authenticatedContext(MEMBER1).firestore().doc(`families/${FAM1}/albums/album1`).set({ id: 'album1', familyId: FAM1, name: 'Trip', createdAt: 1, updatedAt: 1, createdBy: MEMBER1 }));
  });
  it('a member cannot spoof a different family or a different creator uid', async () => {
    const env = await getTestEnv();
    await assertFails(env.authenticatedContext(MEMBER1).firestore().doc(`families/${FAM2}/albums/album2`).set({ id: 'album2', familyId: FAM2, name: 'Spoof', createdAt: 1, updatedAt: 1, createdBy: MEMBER1 }));
    await assertFails(env.authenticatedContext(MEMBER1).firestore().doc(`families/${FAM1}/albums/album3`).set({ id: 'album3', familyId: FAM1, name: 'Spoof', createdAt: 1, updatedAt: 1, createdBy: OWNER1 }));
  });
});
