import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './lib/admin.js';
import { requireUid, requireOwner, requireFrame } from './lib/auth.js';
import { SAFE_REMOTE_SETTINGS_KEYS, type RemoteSettingsPatch } from './shared/types.js';

/** OWNER pushes a whitelisted subset of Settings to a Frame (V2 build §44). Anything outside
 *  SAFE_REMOTE_SETTINGS_KEYS is dropped here, server-side — the client's own whitelist check
 *  (settingsSync.ts) is a second line of defense, not the only one. */
export const updateFrameSettings = onCall<{ frameId: string; patch: Record<string, unknown> }>(async (request) => {
  const uid = requireUid(request);
  const frameId = String(request.data?.frameId ?? '');
  const patch = request.data?.patch ?? {};
  if (!frameId || typeof patch !== 'object') throw new HttpsError('invalid-argument', 'frameId and patch are required.');
  const frame = await requireFrame(frameId);
  if (!frame.familyId) throw new HttpsError('failed-precondition', 'This Frame is not connected to a family.');
  await requireOwner(frame.familyId, uid);

  const safe: RemoteSettingsPatch = { updatedAt: Date.now(), updatedBy: uid };
  let count = 0;
  for (const key of SAFE_REMOTE_SETTINGS_KEYS) {
    if (key in patch) {
      (safe as Record<string, unknown>)[key] = (patch as Record<string, unknown>)[key];
      count++;
    }
  }
  if (count === 0) throw new HttpsError('invalid-argument', 'No recognized settings fields were provided.');
  await db.doc(`frames/${frameId}/remoteSettings/current`).set(safe);
  return { ok: true, appliedKeys: Object.keys(safe).filter((k) => k !== 'updatedAt' && k !== 'updatedBy') };
});
