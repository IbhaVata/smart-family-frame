import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { afterAll, beforeEach, describe, it } from 'vitest';
import { getTestEnv, teardownTestEnv } from './setup';

const FAM1 = 'fam1';
const FAM2 = 'fam2';
const FRAME1 = 'FRAME-TEST01';
const FRAME2 = 'FRAME-TEST02';
const OWNER1 = 'owner1';
const MEMBER1 = 'member1';
const DEVICE1 = 'device1';
const DEVICE2 = 'device2';
const OUTSIDER = 'outsider';

const smallJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const oversized = new Uint8Array(16 * 1024 * 1024); // 16 MB > the 15 MB cap

async function seed() {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(`families/${FAM1}`).set({ id: FAM1, name: 'Family One', ownerUid: OWNER1, createdAt: 1, updatedAt: 1 });
    await db.doc(`families/${FAM1}/members/${OWNER1}`).set({ uid: OWNER1, role: 'OWNER', displayName: 'Owner', status: 'ACTIVE', joinedAt: 1, updatedAt: 1 });
    await db.doc(`families/${FAM1}/members/${MEMBER1}`).set({ uid: MEMBER1, role: 'MEMBER', displayName: 'Member', status: 'ACTIVE', joinedAt: 1, updatedAt: 1 });
    await db.doc(`families/${FAM2}`).set({ id: FAM2, name: 'Family Two', ownerUid: 'owner2', createdAt: 1, updatedAt: 1 });
    await db.doc(`families/${FAM2}/members/owner2`).set({ uid: 'owner2', role: 'OWNER', displayName: 'Owner Two', status: 'ACTIVE', joinedAt: 1, updatedAt: 1 });

    await db.doc(`frames/${FRAME1}`).set({ frameId: FRAME1, familyId: FAM1, name: 'Frame One', ownerUid: OWNER1, deviceUid: DEVICE1, createdAt: 1, updatedAt: 1, lastSeenAt: 1, softwareVersion: '2.0.0', status: 'ONLINE' });
    await db.doc(`frames/${FRAME2}`).set({ frameId: FRAME2, familyId: FAM2, name: 'Frame Two', ownerUid: 'owner2', deviceUid: DEVICE2, createdAt: 1, updatedAt: 1, lastSeenAt: 1, softwareVersion: '2.0.0', status: 'ONLINE' });
  });
}

beforeEach(async () => {
  await seed();
});
afterAll(async () => {
  await teardownTestEnv();
});

describe('families/{familyId}/photos/{frameId}/{fileName} — upload', () => {
  it('an active family member can upload a valid JPEG to their own family+frame path', async () => {
    const env = await getTestEnv();
    const storage = env.authenticatedContext(MEMBER1).storage();
    await assertSucceeds(uploadBytes(ref(storage, `families/${FAM1}/photos/${FRAME1}/ok.jpg`), smallJpeg, { contentType: 'image/jpeg' }));
  });

  it('an unauthenticated caller is denied', async () => {
    const env = await getTestEnv();
    const storage = env.unauthenticatedContext().storage();
    await assertFails(uploadBytes(ref(storage, `families/${FAM1}/photos/${FRAME1}/anon.jpg`), smallJpeg, { contentType: 'image/jpeg' }));
  });

  it('an outsider (not a member of the family) is denied', async () => {
    const env = await getTestEnv();
    const storage = env.authenticatedContext(OUTSIDER).storage();
    await assertFails(uploadBytes(ref(storage, `families/${FAM1}/photos/${FRAME1}/outsider.jpg`), smallJpeg, { contentType: 'image/jpeg' }));
  });

  it('a member of a DIFFERENT family is denied uploading under fam1\'s path', async () => {
    const env = await getTestEnv();
    const storage = env.authenticatedContext('owner2').storage();
    await assertFails(uploadBytes(ref(storage, `families/${FAM1}/photos/${FRAME1}/wrongfamily.jpg`), smallJpeg, { contentType: 'image/jpeg' }));
  });

  it('uploading under a frameId that does not belong to the family in the path is denied', async () => {
    const env = await getTestEnv();
    const storage = env.authenticatedContext(MEMBER1).storage();
    // FRAME2 belongs to fam2, not fam1 — frameBelongsToFamily() must reject this even though the
    // uploader IS an active member of fam1.
    await assertFails(uploadBytes(ref(storage, `families/${FAM1}/photos/${FRAME2}/mismatched.jpg`), smallJpeg, { contentType: 'image/jpeg' }));
  });

  it('an oversized file (> 15 MB) is denied', async () => {
    const env = await getTestEnv();
    const storage = env.authenticatedContext(MEMBER1).storage();
    await assertFails(uploadBytes(ref(storage, `families/${FAM1}/photos/${FRAME1}/big.jpg`), oversized, { contentType: 'image/jpeg' }));
  });

  it('a disallowed content type (e.g. a PDF) is denied', async () => {
    const env = await getTestEnv();
    const storage = env.authenticatedContext(MEMBER1).storage();
    await assertFails(uploadBytes(ref(storage, `families/${FAM1}/photos/${FRAME1}/doc.pdf`), smallJpeg, { contentType: 'application/pdf' }));
  });
});

describe('families/{familyId}/photos/{frameId}/{fileName} — download', () => {
  it('a disconnected device cannot download its former family photos', async () => {
    const env = await getTestEnv();
    const path = `families/${FAM1}/photos/${FRAME1}/disconnected.jpg`;
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), path), smallJpeg, { contentType: 'image/jpeg' });
      await ctx.firestore().doc(`frames/${FRAME1}`).update({ familyId: null });
    });
    await assertFails(getBytes(ref(env.authenticatedContext(DEVICE1).storage(), path)));
  });
  it('a device re-paired to another family cannot download the previous family photos', async () => {
    const env = await getTestEnv();
    const path = `families/${FAM1}/photos/${FRAME1}/previous-family.jpg`;
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), path), smallJpeg, { contentType: 'image/jpeg' });
      await ctx.firestore().doc(`frames/${FRAME1}`).update({ familyId: 'another-family' });
    });
    await assertFails(getBytes(ref(env.authenticatedContext(DEVICE1).storage(), path)));
  });
  it('an active family member can download a photo from their family', async () => {
    const env = await getTestEnv();
    const uploaderStorage = env.authenticatedContext(MEMBER1).storage();
    await env.withSecurityRulesDisabled(async (ctx) => uploadBytes(ref(ctx.storage(), `families/${FAM1}/photos/${FRAME1}/download.jpg`), smallJpeg, { contentType: 'image/jpeg' }));
    await assertSucceeds(getBytes(ref(uploaderStorage, `families/${FAM1}/photos/${FRAME1}/download.jpg`)));
  });

  it('the authorized frame device can download its own family\'s photo', async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => uploadBytes(ref(ctx.storage(), `families/${FAM1}/photos/${FRAME1}/frame-dl.jpg`), smallJpeg, { contentType: 'image/jpeg' }));
    const deviceStorage = env.authenticatedContext(DEVICE1).storage();
    await assertSucceeds(getBytes(ref(deviceStorage, `families/${FAM1}/photos/${FRAME1}/frame-dl.jpg`)));
  });

  it('a DIFFERENT frame\'s device cannot download it', async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => uploadBytes(ref(ctx.storage(), `families/${FAM1}/photos/${FRAME1}/other-frame.jpg`), smallJpeg, { contentType: 'image/jpeg' }));
    const otherDeviceStorage = env.authenticatedContext(DEVICE2).storage();
    await assertFails(getBytes(ref(otherDeviceStorage, `families/${FAM1}/photos/${FRAME1}/other-frame.jpg`)));
  });

  it('an outsider cannot download it', async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => uploadBytes(ref(ctx.storage(), `families/${FAM1}/photos/${FRAME1}/secret.jpg`), smallJpeg, { contentType: 'image/jpeg' }));
    const outsiderStorage = env.authenticatedContext(OUTSIDER).storage();
    await assertFails(getBytes(ref(outsiderStorage, `families/${FAM1}/photos/${FRAME1}/secret.jpg`)));
  });
});

describe('families/{familyId}/photos/{frameId}/{fileName} — update/delete', () => {
  it('overwriting an existing photo (update) is always denied — photos are immutable', async () => {
    const env = await getTestEnv();
    const storage = env.authenticatedContext(MEMBER1).storage();
    const path = `families/${FAM1}/photos/${FRAME1}/immutable.jpg`;
    await env.withSecurityRulesDisabled(async (ctx) => uploadBytes(ref(ctx.storage(), path), smallJpeg, { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(storage, path), smallJpeg, { contentType: 'image/jpeg' }));
  });

  it('the active uploader can delete their own attributed photo', async () => {
    const env = await getTestEnv();
    const path = `families/${FAM1}/photos/${FRAME1}/deleteme.jpg`;
    await env.withSecurityRulesDisabled(async (ctx) => uploadBytes(ref(ctx.storage(), path), smallJpeg, { contentType: 'image/jpeg', customMetadata: { uploadedBy: MEMBER1 } }));
    const storage = env.authenticatedContext(MEMBER1).storage();
    await assertSucceeds(deleteObject(ref(storage, path)));
  });
  it('a member cannot delete another member’s bytes even if they know the object path', async () => {
    const env = await getTestEnv();
    const path = `families/${FAM1}/photos/${FRAME1}/another-upload.jpg`;
    await env.withSecurityRulesDisabled(async (ctx) => uploadBytes(ref(ctx.storage(), path), smallJpeg, { contentType: 'image/jpeg', customMetadata: { uploadedBy: OWNER1 } }));
    await assertFails(deleteObject(ref(env.authenticatedContext(MEMBER1).storage(), path)));
  });
  it('the owner can clean up legacy files without uploader attribution', async () => {
    const env = await getTestEnv();
    const path = `families/${FAM1}/photos/${FRAME1}/legacy.jpg`;
    await env.withSecurityRulesDisabled(async (ctx) => uploadBytes(ref(ctx.storage(), path), smallJpeg, { contentType: 'image/jpeg' }));
    await assertSucceeds(deleteObject(ref(env.authenticatedContext(OWNER1).storage(), path)));
  });
  it('a member cannot forge another uploader’s attribution', async () => {
    const env = await getTestEnv();
    const path = `families/${FAM1}/photos/${FRAME1}/forged.jpg`;
    await assertFails(uploadBytes(ref(env.authenticatedContext(MEMBER1).storage(), path), smallJpeg, { contentType: 'image/jpeg', customMetadata: { uploadedBy: OWNER1 } }));
  });
});
