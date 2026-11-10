/**
 * Low-frequency Frame heartbeat (V2 build §67-68: cost control, never write every few seconds). Calls
 * the `frameHeartbeat` Cloud Function, which itself throttles server-side — this client-side interval is
 * the first line of defense, the server check is the authoritative one.
 */
import type { Functions } from 'firebase/functions';

const HEARTBEAT_INTERVAL_MS = 5 * 60_000; // 5 minutes

let timer: ReturnType<typeof setInterval> | null = null;

async function beat(functions: Functions, frameId: string): Promise<void> {
  try {
    const { httpsCallable } = await import('firebase/functions');
    await httpsCallable(functions, 'frameHeartbeat')({ frameId });
  } catch (e) {
    console.warn('[heartbeat] failed (non-fatal, will retry on next interval)', e);
  }
}

export function startHeartbeat(functions: Functions, frameId: string): () => void {
  stopHeartbeat();
  void beat(functions, frameId);
  timer = setInterval(() => void beat(functions, frameId), HEARTBEAT_INTERVAL_MS);
  return stopHeartbeat;
}

export function stopHeartbeat(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
