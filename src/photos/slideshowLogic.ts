/**
 * Pure slideshow ordering logic. The React hook (useSlideshow) owns the timer; this file owns the math.
 */

export interface SlideshowState {
  /** Photo ids in playback order. */
  order: string[];
  /** Index into `order`. -1 when there are no photos. */
  index: number;
  /**
   * Precomputed order for the NEXT loop cycle (shuffle only), filled in as soon as playback lands on
   * the last index. Without this, `peekNextId` can only guess at the loop boundary (it has to reuse
   * the current, about-to-be-discarded order), while `advance` reshuffles at the moment of wrapping -
   * so the "preloaded" layer the UI already mounted is almost never the photo that actually becomes
   * current. Precomputing removes the mismatch: whichever photo `peekNextId` names IS what `advance`
   * shows next.
   */
  upcoming?: string[];
}

export type Rng = () => number;

export const EMPTY_SLIDESHOW: SlideshowState = { order: [], index: -1 };

export function shuffleArray<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** Attaches `upcoming` when playback is on the last index of a shuffled order longer than one photo. */
function withUpcoming(state: SlideshowState, shuffle: boolean, rng: Rng): SlideshowState {
  const n = state.order.length;
  if (!shuffle || n <= 1 || state.index !== n - 1 || state.upcoming) return state;
  const last = state.order[n - 1];
  let upcoming = shuffleArray(state.order, rng);
  if (upcoming[0] === last) upcoming = upcoming.slice(1).concat([upcoming[0]!]);
  return { ...state, upcoming };
}

export function createSlideshow(ids: readonly string[], shuffle: boolean, rng: Rng = Math.random): SlideshowState {
  if (ids.length === 0) return EMPTY_SLIDESHOW;
  const order = shuffle ? shuffleArray(ids, rng) : ids.slice();
  return withUpcoming({ order, index: 0 }, shuffle, rng);
}

export function currentId(state: SlideshowState): string | null {
  if (state.index < 0 || state.index >= state.order.length) return null;
  return state.order[state.index] ?? null;
}

export function peekNextId(state: SlideshowState, loop: boolean): string | null {
  if (state.order.length === 0) return null;
  const n = state.index + 1;
  if (n < state.order.length) return state.order[n] ?? null;
  if (!loop) return null;
  // Prefer the precomputed cycle so this always matches what advance() is about to show.
  return state.upcoming?.[0] ?? state.order[0] ?? null;
}

export interface AdvanceOptions {
  loop: boolean;
  shuffle: boolean;
  rng?: Rng;
}

/** Moves to the next photo. At the end: loops (reshuffling when shuffle is on) or stays put. */
export function advance(state: SlideshowState, opts: AdvanceOptions): SlideshowState {
  const n = state.order.length;
  const rng = opts.rng ?? Math.random;
  if (n === 0) return EMPTY_SLIDESHOW;
  if (n === 1) return { order: state.order, index: 0 };
  if (state.index + 1 < n) {
    return withUpcoming({ order: state.order, index: state.index + 1 }, opts.shuffle, rng);
  }
  if (!opts.loop) return state;
  if (opts.shuffle) {
    // Reuse the cycle that was already computed when we arrived at the last index, so the photo
    // shown here is exactly the one `peekNextId` named while it was still "next". Only reshuffle
    // fresh if none exists (e.g. shuffle was switched on after we were already at the last photo).
    const last = state.order[n - 1];
    let order = state.upcoming ?? shuffleArray(state.order, rng);
    if (order[0] === last) order = order.slice(1).concat([order[0]!]);
    return withUpcoming({ order, index: 0 }, opts.shuffle, rng);
  }
  return withUpcoming({ order: state.order, index: 0 }, opts.shuffle, rng);
}

/** Moves to the previous photo. At the start: wraps to the end when looping, otherwise stays put. */
export function retreat(state: SlideshowState, opts: Pick<AdvanceOptions, 'loop'> & Partial<Pick<AdvanceOptions, 'shuffle' | 'rng'>>): SlideshowState {
  const n = state.order.length;
  const rng = opts.rng ?? Math.random;
  if (n === 0) return EMPTY_SLIDESHOW;
  if (state.index > 0) return { order: state.order, index: state.index - 1 };
  if (!opts.loop) return state;
  return withUpcoming({ order: state.order, index: n - 1 }, opts.shuffle ?? false, rng);
}

/**
 * Applies library changes (added/removed photos) to an existing playback state without disturbing
 * the current position more than necessary. Removed photos disappear from the order; new photos are
 * appended (inserted at random positions after the current one when shuffle is on).
 * If the current photo was deleted, the index now points at the photo that followed it.
 */
export function reconcile(state: SlideshowState, availableIds: readonly string[], shuffle: boolean, rng: Rng = Math.random): SlideshowState {
  const available = new Set(availableIds);
  if (available.size === 0) return EMPTY_SLIDESHOW;
  if (state.order.length === 0) return createSlideshow(availableIds, shuffle, rng);

  const current = currentId(state);
  const kept = state.order.filter((id) => available.has(id));
  const known = new Set(kept);
  const added = availableIds.filter((id) => !known.has(id));

  let order = kept;
  if (added.length > 0) {
    if (shuffle) {
      const currentPos = current ? kept.indexOf(current) : -1;
      order = kept.slice();
      for (const id of shuffleArray(added, rng)) {
        const min = currentPos + 1;
        const pos = min + Math.floor(rng() * (order.length - min + 1));
        order.splice(pos, 0, id);
      }
    } else {
      order = kept.concat(added);
    }
  }

  if (order.length === 0) return EMPTY_SLIDESHOW;

  let index: number;
  if (current && order.includes(current)) {
    index = order.indexOf(current);
  } else {
    // The current photo was deleted: count how many items before the old index survived.
    const survivingBefore = state.order.slice(0, state.index).filter((id) => available.has(id)).length;
    index = Math.min(survivingBefore, order.length - 1);
  }
  return withUpcoming({ order, index }, shuffle, rng);
}

/** Rebuilds the order when the shuffle setting changes, keeping the current photo on screen. */
export function reorder(state: SlideshowState, shuffle: boolean, rng: Rng = Math.random): SlideshowState {
  if (state.order.length === 0) return state;
  const current = currentId(state);
  if (shuffle) {
    const others = state.order.filter((id) => id !== current);
    const order = current ? [current, ...shuffleArray(others, rng)] : shuffleArray(state.order, rng);
    return withUpcoming({ order, index: 0 }, shuffle, rng);
  }
  const order = state.order.slice().sort();
  return { order, index: current ? Math.max(0, order.indexOf(current)) : 0 };
}
