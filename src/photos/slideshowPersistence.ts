import type { SlideshowState } from './slideshowLogic';

/**
 * Remembers the last playback position for a given photo set so that remounting the slideshow (a
 * schedule switching PHOTOS -> CLOCK -> PHOTOS, or Dashboard <-> Photos alternating) resumes where it
 * left off instead of restarting at index 0 every time. Without this, any schedule that interrupts
 * PHOTOS periodically means a library larger than "photos shown per window" never has its tail seen.
 *
 * Deliberately NOT a React store: this is a single last-known-good snapshot, not shared UI state, and
 * only one Slideshow is ever mounted at a time (Frame Mode shows exactly one mode). Keyed by the exact
 * set of ids so a stale position is never reused after the library actually changes shape (add/delete
 * reconciliation already happens inside a live session; this is only consulted at mount).
 */
let lastKey: string | null = null;
let lastState: SlideshowState | null = null;

export function loadPersistedSlideshow(key: string): SlideshowState | null {
  return lastKey === key ? lastState : null;
}

export function savePersistedSlideshow(key: string, state: SlideshowState): void {
  lastKey = key;
  lastState = state;
}

/** Test-only: clears the remembered position so tests with overlapping id sets don't leak into each other. */
export function __resetPersistedSlideshowForTests(): void {
  lastKey = null;
  lastState = null;
}
