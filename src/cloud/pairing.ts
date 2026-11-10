/**
 * Frame-side pairing client: calls the `createPairingCode` Cloud Function, then watches the code doc
 * (a single short-lived Firestore listener, not polling) so the Settings → Remote Sharing screen can
 * show "Connected!" the moment a family member claims it. See functions/src/pairing.ts for the backend.
 */
import { getCloudServices } from './firebaseApp';
import { ensureDeviceAuth, getFrameIdentity, recordPairing, clearPairing } from './frameIdentity';
import { settingsStore } from '@/app/stores';

export interface PairingCodeResult {
  code: string;
  expiresAt: number;
}

export type PairingWatchResult = { status: 'claimed'; familyId: string; familyName: string } | { status: 'expired' } | { status: 'error'; message: string };

/** Requests a fresh pairing code for this Frame. Returns null if cloud is unavailable. */
export async function createPairingCode(): Promise<PairingCodeResult | null> {
  const services = await getCloudServices();
  if (!services) return null;
  const deviceUid = await ensureDeviceAuth();
  if (!deviceUid) return null;
  try {
    const { httpsCallable } = await import('firebase/functions');
    const identity = await getFrameIdentity();
    const call = httpsCallable<{ frameId: string; frameName: string }, PairingCodeResult>(services.functions, 'createPairingCode');
    const result = await call({ frameId: identity.frameId, frameName: settingsStore.get().frameName });
    // The callable has registered the device document. Keep watching it independently of the QR
    // screen, including if the user leaves that screen before the phone claims the code.
    void import('./syncEngine').then(({ restartSyncEngine }) => restartSyncEngine()).catch((error) => console.warn('[pairing] sync restart failed', error));
    return result.data;
  } catch (e) {
    console.error('[cloud] createPairingCode failed', e);
    return null;
  }
}

/**
 * Watches a pairing code until it is claimed or expires. Calls `onResult` exactly once. Returns an
 * unsubscribe function the caller MUST invoke if the Settings screen closes before that (e.g. the owner
 * navigates away) — this is a small, deliberately time-boxed listener, not a standing subscription.
 */
export async function watchPairingCode(code: string, expiresAt: number, onResult: (result: PairingWatchResult) => void): Promise<() => void> {
  const services = await getCloudServices();
  if (!services) {
    onResult({ status: 'error', message: 'Remote sharing is not configured.' });
    return () => undefined;
  }
  const { doc, onSnapshot, getDoc } = await import('firebase/firestore');
  let settled = false;
  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    unsubscribe();
    onResult({ status: 'expired' });
  }, Math.max(0, expiresAt - Date.now()));

  const unsubscribe = onSnapshot(
    doc(services.db, 'pairingCodes', code),
    async (snap) => {
      if (settled) return;
      const data = snap.data() as { used?: boolean; frameId?: string } | undefined;
      if (!data?.used || !data.frameId) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      try {
        // Read familyName off the FRAME's own doc (denormalized by claimPairingCode), not
        // families/{familyId} directly: the Frame's device identity is never a family member, so
        // Firestore rules correctly deny it reading a family doc — only its own frame doc is readable.
        const frameSnap = await getDoc(doc(services.db, 'frames', data.frameId));
        const frame = frameSnap.data() as { familyId?: string; familyName?: string | null } | undefined;
        if (!frame?.familyId) {
          onResult({ status: 'error', message: 'Pairing completed but the family could not be loaded.' });
          return;
        }
        const familyName = frame.familyName ?? 'Family';
        await recordPairing(frame.familyId, familyName);
        onResult({ status: 'claimed', familyId: frame.familyId, familyName });
      } catch (e) {
        onResult({ status: 'error', message: e instanceof Error ? e.message : 'Pairing failed.' });
      }
    },
    (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      onResult({ status: 'error', message: error.message });
    },
  );
  return () => {
    settled = true;
    clearTimeout(timeout);
    unsubscribe();
  };
}

/** Disconnects the Frame from its family (owner-confirmed in the UI before calling this). */
export async function disconnectFrame(): Promise<{ ok: true } | { ok: false; message: string }> {
  const services = await getCloudServices();
  if (!services) return { ok: false, message: 'Remote sharing is not configured.' };
  try {
    const { httpsCallable } = await import('firebase/functions');
    const identity = await getFrameIdentity();
    const call = httpsCallable(services.functions, 'disconnectFrame');
    await call({ frameId: identity.frameId });
    await clearPairing();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Disconnect failed.' };
  }
}
