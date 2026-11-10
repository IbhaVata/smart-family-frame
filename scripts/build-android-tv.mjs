import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env };
if (!env.JAVA_HOME && process.platform === 'darwin') {
  const candidates = ['/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home', '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home', '/Applications/Android Studio.app/Contents/jbr/Contents/Home'];
  env.JAVA_HOME = candidates.find((p) => existsSync(path.join(p, 'bin/java')));
}
if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT && process.platform === 'darwin') {
  const sdk = path.join(homedir(), 'Library/Android/sdk');
  if (existsSync(sdk)) env.ANDROID_HOME = sdk;
}
const gradle = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
try {
  execFileSync(gradle, process.argv.length > 2 ? process.argv.slice(2) : [':app:assembleDebug', ':app:lintDebug'], { cwd: path.join(root, 'android'), env, stdio: 'inherit' });
} catch (error) {
  process.exit(typeof error.status === 'number' ? error.status : 1);
}
