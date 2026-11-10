/**
 * Reads Firebase configuration from Vite env vars. Cloud is OPTIONAL: if any required var is missing,
 * `getCloudConfig()` returns null and every caller in src/cloud/ must treat that as "remote sharing not
 * configured" — never throw, never block V1 features. See .env.example and FIREBASE_SETUP.md.
 */

export interface CloudConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  useEmulator: boolean;
  emulatorHost: string;
}

let cached: CloudConfig | null | undefined;

function readEnv(key: string): string | undefined {
  try {
    // import.meta.env is statically replaced by Vite; guarded for non-Vite contexts (e.g. plain Vitest).
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env?.[key];
  } catch {
    return undefined;
  }
}

/** Returns the Firebase config, or null if remote sharing has not been configured for this build. */
export function getCloudConfig(): CloudConfig | null {
  if (cached !== undefined) return cached;
  const apiKey = readEnv('VITE_FIREBASE_API_KEY');
  const authDomain = readEnv('VITE_FIREBASE_AUTH_DOMAIN');
  const projectId = readEnv('VITE_FIREBASE_PROJECT_ID');
  const storageBucket = readEnv('VITE_FIREBASE_STORAGE_BUCKET');
  const messagingSenderId = readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID');
  const appId = readEnv('VITE_FIREBASE_APP_ID');
  if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) {
    cached = null;
    return null;
  }
  cached = {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    useEmulator: readEnv('VITE_FIREBASE_USE_EMULATOR') === 'true',
    emulatorHost: readEnv('VITE_FIREBASE_EMULATOR_HOST') || 'localhost',
  };
  return cached;
}

/** True if a Firebase project is configured for this build (does not imply the network is reachable). */
export function isCloudConfigured(): boolean {
  return getCloudConfig() !== null;
}

/** Test-only: clears the cached config so tests can simulate different env states. */
export function resetCloudConfigCacheForTests(): void {
  cached = undefined;
}
