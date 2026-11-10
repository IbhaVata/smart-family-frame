import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './lib/admin.js';
import { requireUid } from './lib/auth.js';

const COLLECTIONS = new Set(['householdServices', 'householdServiceSettings', 'householdEntries', 'householdPayments']);
const MAX_WRITES = 100;

type HouseholdWrite = {
  collection: string;
  docId: string;
  op: 'upsert' | 'delete';
  data?: Record<string, unknown>;
};

export const syncFrameHousehold = onCall<{ frameId: string; writes: HouseholdWrite[] }>(async (request) => {
  const uid = requireUid(request);
  const frameId = String(request.data?.frameId ?? '');
  const writes = request.data?.writes;
  if (!frameId || !Array.isArray(writes) || writes.length > MAX_WRITES) {
    throw new HttpsError('invalid-argument', `frameId and at most ${MAX_WRITES} writes are required.`);
  }
  const frameSnap = await db.doc(`frames/${frameId}`).get();
  const frame = frameSnap.data() as { deviceUid?: string } | undefined;
  if (!frame || frame.deviceUid !== uid) throw new HttpsError('permission-denied', 'Only this Frame device can sync its Household data.');

  const batch = db.batch();
  for (const write of writes) {
    if (!COLLECTIONS.has(write.collection) || !/^[^/]{1,200}$/.test(write.docId)) {
      throw new HttpsError('invalid-argument', 'Invalid Household write target.');
    }
    const ref = db.doc(`frames/${frameId}/${write.collection}/${write.docId}`);
    if (write.op === 'delete') batch.delete(ref);
    else if (write.op === 'upsert' && write.data && typeof write.data === 'object') batch.set(ref, write.data);
    else throw new HttpsError('invalid-argument', 'Invalid Household write operation.');
  }
  await batch.commit();
  return { ok: true as const };
});
