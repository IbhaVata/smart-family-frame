import { createStore } from '@/app/store';
import { msUntilNextBoundary } from '@/utils/time';

/**
 * One shared minute-aligned tick for the whole app (scheduler + reminders).
 * It uses a single setTimeout re-armed at each minute boundary (no polling loops) and re-checks
 * immediately when the page becomes visible again (e.g. after the Mac sleeps).
 */
export const minuteStore = createStore<Date>(new Date());

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function fire(): void {
  minuteStore.set(new Date());
  arm();
}

function arm(): void {
  if (timer) clearTimeout(timer);
  // +50ms so we land safely inside the new minute.
  timer = setTimeout(fire, msUntilNextBoundary(Date.now(), 60_000) + 50);
}

function onVisibility(): void {
  if (document.visibilityState === 'visible') fire();
}

export function startTicker(): void {
  if (started) return;
  started = true;
  arm();
  document.addEventListener('visibilitychange', onVisibility);
}

export function stopTicker(): void {
  if (!started) return;
  started = false;
  if (timer) clearTimeout(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onVisibility);
}

/** Force an immediate re-evaluation (e.g. right after data changes). */
export function tickNow(): void {
  minuteStore.set(new Date());
}
