/**
 * Stable, human-readable Frame ID (e.g. "FRAME-8H72K9") persisted in IndexedDB (`frameIdentity` store,
 * V2_ARCHITECTURE.md §18). Generated once and never regenerated — survives browser restarts, Mac
 * restarts, app updates and normal logout/login. Also owns the Frame's anonymous Firebase Auth identity
 * (`deviceUid`), which is what Firestore/Storage security rules check for Frame-scoped access.
 */
import { frameIdentityRepo } from '@/storage/repositories';
import type { FrameIdentity } from '../../shared/types';
import { getCloudServices } from './firebaseApp';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids visual ambiguity on the frame's QR/code display

function randomFrameId(): string {
  const bytes = new Uint8Array(6);
  (globalThis.crypto ?? ({ getRandomValues: (a: Uint8Array) => a.map(() => Math.floor(Math.random() * 256)) } as Crypto)).getRandomValues(bytes);
  let suffix = '';
  for (const b of bytes) suffix += ALPHABET[b % ALPHABET.length];
  return `FRAME-${suffix}`;
}

let loaded: Promise<FrameIdentity> | null = null;

/** Loads the Frame's identity, generating and persisting one on first call. Local-only; no network. */
export function getFrameIdentity(): Promise<FrameIdentity> {
  if (!loaded) {
    loaded = (async () => {
      const existing = await frameIdentityRepo.load();
      if (existing) return existing;
      const fresh: FrameIdentity = { key: 'device', frameId: randomFrameId(), deviceUid: null, createdAt: Date.now(), familyId: null, familyName: null, pairedAt: null };
      await frameIdentityRepo.save(fresh);
      return fresh;
    })();
    loaded.catch(() => {
      loaded = null; // a transient IndexedDB error at boot must not break pairing/sync until reload
    });
  }
  return loaded;
}

/** Test-only: forces the next getFrameIdentity() call to reload from storage. */
export function resetFrameIdentityCacheForTests(): void {
  loaded = null;
}

/**
 * Ensures the Frame has a signed-in anonymous Firebase Auth identity, creating one on first cloud use
 * and persisting its uid into frameIdentity so it is stable across sessions. Returns null if cloud is
 * not configured or sign-in fails (never throws) — callers fall back to "cloud unavailable" UI.
 */
let authPending: Promise<string | null> | null = null;
export function ensureDeviceAuth(): Promise<string | null> {
  authPending ??= authenticateDevice().finally(() => { authPending = null; });
  return authPending;
}
async function authenticateDevice(): Promise<string | null> {
  const services = await getCloudServices();
  if (!services) return null;
  try {
    const { onAuthStateChanged, signInAnonymously } = await import('firebase/auth');
    const uid = await new Promise<string | null>((resolve) => {
      const unsubscribe = onAuthStateChanged(services.auth, (user) => {
        unsubscribe();
        resolve(user?.uid ?? null);
      });
    });
    let resolvedUid = uid;
    if (!resolvedUid) {
      const cred = await signInAnonymously(services.auth);
      resolvedUid = cred.user.uid;
    }
    const identity = await getFrameIdentity();
    if (identity.deviceUid !== resolvedUid) {
      const next = { ...identity, deviceUid: resolvedUid };
      await frameIdentityRepo.save(next);
      loaded = Promise.resolve(next);
    }
    return resolvedUid;
  } catch (e) {
    console.error('[cloud] device auth failed; remote sharing unavailable this session.', e);
    return null;
  }
}

/** Records a successful pairing (called after claimPairingCode succeeds). */
export async function recordPairing(familyId: string, familyName: string): Promise<void> {
  const identity = await getFrameIdentity();
  const next: FrameIdentity = { ...identity, familyId, familyName, pairedAt: Date.now() };
  await frameIdentityRepo.save(next);
  loaded = Promise.resolve(next);
}

/** Clears the family association (Disconnect Cloud). The frameId itself is never regenerated. */
export async function clearPairing(): Promise<void> {
  const identity = await getFrameIdentity();
  const next: FrameIdentity = { ...identity, familyId: null, familyName: null, pairedAt: null };
  await frameIdentityRepo.save(next);
  loaded = Promise.resolve(next);
}
