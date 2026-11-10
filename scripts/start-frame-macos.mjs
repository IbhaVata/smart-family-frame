#!/usr/bin/env node

import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { dirname, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = resolve(projectDir, '.frame-runtime');
const pidFile = resolve(runtimeDir, 'server.pid');
const logFile = resolve(runtimeDir, 'server.log');
const url = 'http://localhost:4400';
const dryRun = process.argv.includes('--dry-run');
const skipBuild = process.argv.includes('--no-build');
const displayX = process.env.FRAME_DISPLAY_X ?? '1920';
const displayY = process.env.FRAME_DISPLAY_Y ?? '0';
const displayWidth = process.env.FRAME_DISPLAY_WIDTH ?? '1920';
const displayHeight = process.env.FRAME_DISPLAY_HEIGHT ?? '1080';

function run(command, args) {
  if (dryRun) {
    console.log(`[dry-run] ${command} ${args.join(' ')}`);
    return;
  }
  const result = spawnSync(command, args, { cwd: projectDir, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function reachable() {
  return new Promise((resolveReachable) => {
    const req = request(url, { method: 'HEAD', timeout: 1000 }, (res) => {
      res.resume();
      resolveReachable(Boolean(res.statusCode && res.statusCode < 500));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolveReachable(false));
    req.end();
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await reachable()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Frame server did not become reachable. Check ${logFile}`);
}

function recordedServerIsAlive() {
  try {
    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    if (!Number.isInteger(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('Smart Family Frame — Mac + Acer launcher');
  console.log(`Project: ${projectDir}`);

  if (!skipBuild) run('npm', ['run', 'build']);

  const alreadyReachable = dryRun ? false : await reachable();
  if (alreadyReachable) {
    console.log('Frame server is already available on port 4400; leaving it running.');
  } else if (recordedServerIsAlive()) {
    console.log('The recorded frame server is still starting.');
  } else if (dryRun) {
    console.log(`[dry-run] start detached Vite preview; pid=${pidFile}; log=${logFile}`);
  } else {
    mkdirSync(runtimeDir, { recursive: true });
    const fd = openSync(logFile, 'a');
    const child = spawn(process.execPath, [resolve(projectDir, 'node_modules/vite/bin/vite.js'), 'preview'], {
      cwd: projectDir,
      detached: true,
      stdio: ['ignore', fd, fd],
    });
    child.unref();
    closeSync(fd);
    writeFileSync(pidFile, `${child.pid}\n`, 'utf8');
    console.log(`Started persistent frame server (PID ${child.pid}).`);
  }

  if (!dryRun) await waitForServer();

  const right = Number(displayX) + Number(displayWidth);
  const bottom = Number(displayY) + Number(displayHeight);
  if (![right, bottom].every(Number.isFinite)) throw new Error('Frame display coordinates must be numbers.');
  // Reuse the already-installed, normal Chrome profile. `open -na` creates a separate Chrome
  // process and can therefore expose a different IndexedDB context — unacceptable for the real
  // port-4400 data. AppleScript creates a normal-profile window and positions it without touching
  // any browser storage or closing existing tabs.
  const appleScript = [
    'tell application "Google Chrome"',
    'set frameWindow to missing value',
    'repeat with candidateWindow in every window',
    'set candidateIndex to 0',
    'repeat with candidateTab in every tab of candidateWindow',
    'set candidateIndex to candidateIndex + 1',
    `if URL of candidateTab starts with "${url}" then`,
    'set active tab index of candidateWindow to candidateIndex',
    'set frameWindow to candidateWindow',
    'exit repeat',
    'end if',
    'end repeat',
    'if frameWindow is not missing value then exit repeat',
    'end repeat',
    'if frameWindow is missing value then',
    'set frameWindow to make new window',
    `set URL of active tab of frameWindow to "${url}"`,
    'end if',
    `set bounds of frameWindow to {${displayX}, ${displayY}, ${right}, ${bottom}}`,
    'set index of frameWindow to 1',
    'activate',
    'end tell',
  ];
  const osascriptArgs = appleScript.flatMap((line) => ['-e', line]);
  run('/usr/bin/osascript', osascriptArgs);
  console.log(`Opened ${url} in the normal Chrome profile at ${displayX},${displayY}.`);
  console.log('Press ENTER FRAME MODE once if the frame was not already active.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
