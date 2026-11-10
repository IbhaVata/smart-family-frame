import { describe, it, expect } from 'vitest';
import { createSlideshow, advance, retreat, reconcile, currentId, peekNextId, reorder, EMPTY_SLIDESHOW } from '@/photos/slideshowLogic';
import { seededRng } from './helpers';

const ids = ['a', 'b', 'c', 'd'];

describe('slideshow ordering', () => {
  it('handles zero photos', () => {
    const s = createSlideshow([], false);
    expect(currentId(s)).toBeNull();
    expect(advance(s, { loop: true, shuffle: false })).toEqual(EMPTY_SLIDESHOW);
    expect(retreat(s, { loop: true })).toEqual(EMPTY_SLIDESHOW);
  });

  it('handles a single photo', () => {
    const s = createSlideshow(['only'], false);
    expect(currentId(s)).toBe('only');
    expect(currentId(advance(s, { loop: true, shuffle: false }))).toBe('only');
    expect(currentId(retreat(s, { loop: true }))).toBe('only');
    expect(peekNextId(s, true)).toBe('only');
  });

  it('advances sequentially and loops', () => {
    let s = createSlideshow(ids, false);
    expect(currentId(s)).toBe('a');
    s = advance(s, { loop: true, shuffle: false });
    expect(currentId(s)).toBe('b');
    s = advance(s, { loop: true, shuffle: false });
    s = advance(s, { loop: true, shuffle: false });
    expect(currentId(s)).toBe('d');
    s = advance(s, { loop: true, shuffle: false });
    expect(currentId(s)).toBe('a');
  });

  it('stops at the end when loop is off', () => {
    let s = createSlideshow(ids, false);
    for (let i = 0; i < 10; i++) s = advance(s, { loop: false, shuffle: false });
    expect(currentId(s)).toBe('d');
    expect(peekNextId(s, false)).toBeNull();
  });

  it('goes to previous and wraps', () => {
    let s = createSlideshow(ids, false);
    s = retreat(s, { loop: true });
    expect(currentId(s)).toBe('d');
    s = retreat(s, { loop: true });
    expect(currentId(s)).toBe('c');
    const noLoop = retreat(createSlideshow(ids, false), { loop: false });
    expect(currentId(noLoop)).toBe('a');
  });

  it('shuffle keeps every photo exactly once', () => {
    const s = createSlideshow(ids, true, seededRng(7));
    expect(s.order.slice().sort()).toEqual(ids);
    expect(s.order.length).toBe(4);
  });

  it('shuffle reshuffles at loop boundary without immediate repeat', () => {
    for (let seed = 1; seed < 40; seed++) {
      const rng = seededRng(seed);
      let s = createSlideshow(ids, true, rng);
      for (let i = 0; i < 3; i++) s = advance(s, { loop: true, shuffle: true, rng });
      const last = currentId(s);
      s = advance(s, { loop: true, shuffle: true, rng });
      expect(s.index).toBe(0);
      expect(currentId(s)).not.toBe(last);
      expect(s.order.slice().sort()).toEqual(ids);
    }
  });

  it('removes deleted photos and keeps the current one', () => {
    let s = createSlideshow(ids, false);
    s = advance(s, { loop: true, shuffle: false }); // b
    s = reconcile(s, ['a', 'b', 'd'], false);
    expect(currentId(s)).toBe('b');
    expect(s.order).toEqual(['a', 'b', 'd']);
  });

  it('moves to the following photo when the current one is deleted', () => {
    let s = createSlideshow(ids, false);
    s = advance(s, { loop: true, shuffle: false }); // b
    s = reconcile(s, ['a', 'c', 'd'], false);
    expect(currentId(s)).toBe('c');
  });

  it('clamps when the last photo is deleted while current', () => {
    let s = createSlideshow(ids, false);
    for (let i = 0; i < 3; i++) s = advance(s, { loop: true, shuffle: false }); // d
    s = reconcile(s, ['a', 'b', 'c'], false);
    expect(currentId(s)).toBe('c');
  });

  it('appends new photos in sequential mode', () => {
    let s = createSlideshow(['a', 'b'], false);
    s = reconcile(s, ['a', 'b', 'c'], false);
    expect(s.order).toEqual(['a', 'b', 'c']);
    expect(currentId(s)).toBe('a');
  });

  it('inserts new photos after the current one in shuffle mode', () => {
    const rng = seededRng(3);
    let s = createSlideshow(['a', 'b', 'c'], true, rng);
    s = advance(s, { loop: true, shuffle: true, rng });
    const cur = currentId(s)!;
    s = reconcile(s, ['a', 'b', 'c', 'x', 'y'], true, rng);
    expect(currentId(s)).toBe(cur);
    expect(s.order.indexOf('x')).toBeGreaterThan(s.index);
    expect(s.order.indexOf('y')).toBeGreaterThan(s.index);
    expect(s.order.slice().sort()).toEqual(['a', 'b', 'c', 'x', 'y']);
  });

  it('empties when all photos are deleted', () => {
    const s = reconcile(createSlideshow(ids, false), [], false);
    expect(s).toEqual(EMPTY_SLIDESHOW);
  });

  it('reorder keeps the current photo when toggling shuffle', () => {
    let s = createSlideshow(ids, false);
    s = advance(s, { loop: true, shuffle: false }); // b
    const shuffled = reorder(s, true, seededRng(1));
    expect(currentId(shuffled)).toBe('b');
    expect(shuffled.index).toBe(0);
    const back = reorder(shuffled, false);
    expect(currentId(back)).toBe('b');
    expect(back.order).toEqual(ids);
  });
});

describe('shuffle + loop: the preloaded "next" photo always matches what advance() actually shows', () => {
  it('peekNextId at the loop boundary is exactly the photo advance() lands on, across many seeds and sizes', () => {
    for (const n of [2, 3, 5, 10, 30]) {
      const set = Array.from({ length: n }, (_, i) => `x${i}`);
      for (let seed = 1; seed <= 60; seed++) {
        const rng = seededRng(seed * 31 + n);
        let s = createSlideshow(set, true, rng);
        // Walk to the last index.
        for (let i = 0; i < n - 1; i++) s = advance(s, { loop: true, shuffle: true, rng });
        expect(s.index).toBe(n - 1);
        const predicted = peekNextId(s, true);
        const after = advance(s, { loop: true, shuffle: true, rng });
        expect(currentId(after)).toBe(predicted);
        expect(after.order.slice().sort()).toEqual(set.slice().sort());
      }
    }
  });
  it('toggling shuffle on (via reorder, as useSlideshow does on a settings change) keeps the prediction accurate even at the last index', () => {
    const rng = seededRng(7);
    let s = createSlideshow(ids, false, rng);
    for (let i = 0; i < 3; i++) s = advance(s, { loop: true, shuffle: false, rng });
    expect(s.index).toBe(3);
    // useSlideshow always runs reorder() the moment the shuffle setting changes (before any later
    // advance()), which is what actually (re)computes `upcoming` for the new mode.
    s = reorder(s, true, rng);
    const predicted = peekNextId(s, true);
    const after = advance(s, { loop: true, shuffle: true, rng });
    expect(currentId(after)).toBe(predicted);
  });
});
