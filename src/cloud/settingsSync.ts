/**
 * Applies OWNER-pushed remote settings changes to the local Settings (V2 build §44: only a whitelisted
 * "safe" subset — never arbitrary fields). Goes through the existing `updateSettings()` mutation and
 * `normalizeSettings()` validation, so a malformed or malicious cloud payload can never write anything
 * outside the normal Settings shape.
 */
import type { Firestore, Unsubscribe } from 'firebase/firestore';
import { updateSettings } from '@/services/dataService';
import { settingsStore, toast } from '@/app/stores';
import type { Settings } from '@/types';
import { SAFE_REMOTE_SETTINGS_KEYS, type RemoteSettingsPatch } from '../../shared/types';

const LAST_APPLIED_KEY = 'sff.remoteSettings.lastAppliedAt';
let lastAppliedAt = readLastApplied();

function readLastApplied(): number {
  try {
    return Number(globalThis.localStorage?.getItem(LAST_APPLIED_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeLastApplied(value: number): void {
  try {
    globalThis.localStorage?.setItem(LAST_APPLIED_KEY, String(value));
  } catch {
    // Storage unavailable: worst case a remote push is re-applied after the next reload.
  }
}

export async function watchRemoteSettings(db: Firestore, frameId: string): Promise<Unsubscribe> {
  const { doc, onSnapshot } = await import('firebase/firestore');
  return onSnapshot(
    doc(db, 'frames', frameId, 'remoteSettings', 'current'),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as RemoteSettingsPatch;
      if (!data.updatedAt || data.updatedAt <= lastAppliedAt) return; // already applied, or stale/out-of-order snapshot
      lastAppliedAt = data.updatedAt;
      const patch: Partial<Settings> = {};
      const current = settingsStore.get();
      for (const key of SAFE_REMOTE_SETTINGS_KEYS) {
        if (!(key in data)) continue;
        const value = data[key];
        // Only accept a value of the same type as the existing setting — cheap, effective defense
        // against a malformed payload before it ever reaches normalizeSettings().
        if (typeof value === typeof current[key]) (patch as Record<string, unknown>)[key] = value;
      }
      if (Object.keys(patch).length === 0) return;
      const appliedAt = data.updatedAt;
      updateSettings(patch)
        .then(() => {
          writeLastApplied(appliedAt);
          toast('Settings updated remotely.', 'info');
        })
        .catch((error) => console.error('[settingsSync] failed to apply remote settings', error));
    },
    (error) => console.error('[settingsSync] listener failed', error),
  );
}
