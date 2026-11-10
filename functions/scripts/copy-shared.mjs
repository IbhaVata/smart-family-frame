#!/usr/bin/env node
/**
 * Copies the repo-root shared/ TypeScript source into functions/src/shared/ before every build.
 *
 * WHY: shared/ (household calculation engine + cross-cutting V2 types) is the single source of truth,
 * also used by the Frame app and the Family PWA. Firebase's deploy step only uploads the `functions/`
 * directory, so a Cloud Function cannot import a relative path that lives outside it. Rather than
 * hand-maintaining a second copy (which is exactly the duplication V2_SYNC.md says to avoid), this
 * script mechanically copies the current source in on every `npm run build` — functions/src/shared/ is
 * a BUILD ARTIFACT (gitignored; see functions/.gitignore) and should never be hand-edited.
 */
import { cpSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', '..', 'shared');
const dest = join(here, '..', 'src', 'shared');

if (!existsSync(source)) {
  console.error(`[copy-shared] source directory not found: ${source}`);
  process.exit(1);
}
if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(source, dest, { recursive: true });
console.log(`[copy-shared] copied ${source} -> ${dest}`);
