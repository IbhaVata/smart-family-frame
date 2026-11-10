import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

let env: RulesTestEnvironment | null = null;

/** Shared emulator test environment, reading the REAL firestore.rules/storage.rules from the repo root
 *  (not a copy) so these tests exercise exactly what would be deployed. Requires the Firestore and
 *  Storage emulators to already be running — see `npm run test:rules` at the repo root, which wraps
 *  this whole suite in `firebase emulators:exec`. */
export async function getTestEnv(): Promise<RulesTestEnvironment> {
  if (env) return env;
  env = await initializeTestEnvironment({
    projectId: 'demo-smart-family-frame',
    firestore: { rules: readFileSync(join(repoRoot, 'firestore.rules'), 'utf8'), host: 'localhost', port: 8080 },
    storage: { rules: readFileSync(join(repoRoot, 'storage.rules'), 'utf8'), host: 'localhost', port: 9199 },
  });
  return env;
}

export async function teardownTestEnv(): Promise<void> {
  if (env) {
    await env.cleanup();
    env = null;
  }
}
