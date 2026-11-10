import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSlideshow, advance, retreat, reconcile, reorder, currentId, peekNextId, type SlideshowState } from './slideshowLogic';
import { slideshowBus } from './slideshowBus';
import { loadPersistedSlideshow, savePersistedSlideshow } from './slideshowPersistence';

export interface UseSlideshowOptions {
  intervalSec: number;
  shuffle: boolean;
  loop: boolean;
  paused: boolean;
  /** Respond to global next/prev commands (frame controls / keyboard). */
  listenToBus?: boolean;
}

export interface SlideshowController {
  currentId: string | null;
  nextId: string | null;
  position: number;
  count: number;
  next: () => void;
  prev: () => void;
  markBroken: (id: string) => void;
  allBroken: boolean;
}

/**
 * Owns the slideshow timer. Exactly one timeout exists at a time: it is re-armed whenever the current
 * photo, interval or paused state changes, and cleared on unmount. Changing the interval in Settings
 * therefore takes effect immediately.
 */
export function useSlideshow(ids: readonly string[], opts: UseSlideshowOptions): SlideshowController {
  const { intervalSec, shuffle, loop, paused, listenToBus = true } = opts;
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const usable = useMemo(() => ids.filter((id) => !broken.has(id)), [ids, broken]);
  const usableKey = usable.join('|');
  // Resume the previous position for this exact photo set (see slideshowPersistence.ts) instead of
  // always restarting at index 0 - important when a schedule remounts this component periodically.
  const [state, setState] = useState<SlideshowState>(() => loadPersistedSlideshow(usableKey) ?? createSlideshow(usable, shuffle));

  // Library changed (add/delete/broken): keep position, drop missing, add new.
  const firstRun = useRef(true);
  const usableRef = useRef(usable);
  usableRef.current = usable;
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setState((s) => reconcile(s, usableRef.current, shuffleRef.current));
  }, [usableKey]);

  // Shuffle toggled: rebuild the order but keep the current photo on screen.
  const shuffleRef = useRef(shuffle);
  useEffect(() => {
    if (shuffleRef.current === shuffle) return;
    shuffleRef.current = shuffle;
    setState((s) => reorder(s, shuffle));
  }, [shuffle]);

  useEffect(() => {
    savePersistedSlideshow(usableKey, state);
  }, [usableKey, state]);

  const next = useCallback(() => setState((s) => advance(s, { loop, shuffle })), [loop, shuffle]);
  const prev = useCallback(() => setState((s) => retreat(s, { loop, shuffle })), [loop, shuffle]);

  // The single timer.
  useEffect(() => {
    if (paused || state.order.length < 2) return;
    if (!loop && state.index >= state.order.length - 1) return;
    const t = setTimeout(next, Math.max(1, intervalSec) * 1000);
    return () => clearTimeout(t);
  }, [state, intervalSec, paused, loop, next]);

  useEffect(() => {
    if (!listenToBus) return;
    return slideshowBus.subscribe((cmd) => (cmd === 'next' ? next() : prev()));
  }, [listenToBus, next, prev]);

  const markBroken = useCallback((id: string) => {
    setBroken((prev) => {
      if (prev.has(id)) return prev;
      const n = new Set(prev);
      n.add(id);
      return n;
    });
  }, []);

  return {
    currentId: currentId(state),
    nextId: peekNextId(state, loop),
    position: state.index,
    count: state.order.length,
    next,
    prev,
    markBroken,
    allBroken: ids.length > 0 && usable.length === 0,
  };
}
