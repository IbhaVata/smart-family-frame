/**
 * Remembers whether the frame was showing when the page went away, so an unattended reload (service-worker
 * update, crash recovery, kiosk browser restart) brings the frame straight back instead of parking on the
 * management screen. A tiny flag in localStorage is fine here; photos never go to localStorage.
 */
const KEY = 'sff.frameActive';

export function rememberFrameActive(active: boolean): void {
  try {
    if (active) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the frame simply will not auto-resume */
  }
}

export function wasFrameActive(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
