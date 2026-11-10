// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSlideshow, type UseSlideshowOptions } from '@/photos/useSlideshow';
import { slideshowBus } from '@/photos/slideshowBus';
import { __resetPersistedSlideshowForTests } from '@/photos/slideshowPersistence';

const ids = (n: number, prefix = 'p') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** Counts outstanding timeouts created with a delay >= 1000 ms (the slideshow's); ignores React's tiny scheduler timers. */
function trackTimers() {
  const origSet = globalThis.setTimeout;
  const origClear = globalThis.clearTimeout;
  const live = new Map<unknown, number>();
  globalThis.setTimeout = ((fn: (...a: unknown[]) => void, delay?: number, ...args: unknown[]) => {
    const id = origSet(() => {
      live.delete(id);
      fn(...args);
    }, delay);
    live.set(id, delay ?? 0);
    return id;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: unknown) => {
    live.delete(id);
    origClear(id as number);
  }) as typeof clearTimeout;
  return {
    slideshowTimers: () => [...live.values()].filter((d) => d >= 1000).length,
    restore: () => {
      globalThis.setTimeout = origSet;
      globalThis.clearTimeout = origClear;
    },
  };
}

const base: UseSlideshowOptions = { intervalSec: 5, shuffle: false, loop: true, paused: false };
let timers: ReturnType<typeof trackTimers>;
beforeEach(() => {
  vi.useFakeTimers();
  timers = trackTimers();
  __resetPersistedSlideshowForTests();
});
afterEach(() => {
  cleanup(); // unmount every hook so no stale subscriber/timer survives into the next test
  timers.restore();
  vi.useRealTimers();
});

function mount(list: string[], opts: Partial<UseSlideshowOptions> = {}) {
  return renderHook((p: { ids: string[]; opts: UseSlideshowOptions }) => useSlideshow(p.ids, p.opts), { initialProps: { ids: list, opts: { ...base, ...opts } } });
}
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('slideshow timer discipline', () => {
  it('keeps exactly one pending timer while playing and none after unmount', () => {
    const h = mount(ids(10));
    expect(timers.slideshowTimers()).toBe(1);
    tick(5000);
    expect(h.result.current.position).toBe(1);
    expect(timers.slideshowTimers()).toBe(1);
    h.unmount();
    expect(timers.slideshowTimers()).toBe(0);
  });
  it('1 photo: no timer at all, current stays', () => {
    const h = mount(ids(1));
    expect(timers.slideshowTimers()).toBe(0);
    tick(60_000);
    expect(h.result.current.currentId).toBe('p0');
    expect(h.result.current.nextId).toBe('p0');
  });
  it('pause clears the timer; resume re-arms it', () => {
    const h = mount(ids(10));
    h.rerender({ ids: ids(10), opts: { ...base, paused: true } });
    expect(timers.slideshowTimers()).toBe(0);
    tick(60_000);
    expect(h.result.current.position).toBe(0);
    h.rerender({ ids: ids(10), opts: { ...base, paused: false } });
    expect(timers.slideshowTimers()).toBe(1);
    tick(5000);
    expect(h.result.current.position).toBe(1);
  });
  it('changing the interval re-arms immediately with the new duration', () => {
    const h = mount(ids(10), { intervalSec: 30 });
    tick(10_000);
    h.rerender({ ids: ids(10), opts: { ...base, intervalSec: 5 } });
    expect(timers.slideshowTimers()).toBe(1);
    tick(4_999);
    expect(h.result.current.position).toBe(0);
    tick(1);
    expect(h.result.current.position).toBe(1);
  });
  it('loop off: stops on the last photo with no timer', () => {
    const h = mount(ids(3), { loop: false });
    tick(5000);
    tick(5000);
    expect(h.result.current.position).toBe(2);
    expect(timers.slideshowTimers()).toBe(0);
    tick(50_000);
    expect(h.result.current.position).toBe(2);
  });
  it('manual next/prev via the bus advances immediately and restarts the timer', () => {
    const h = mount(ids(10));
    tick(3000);
    act(() => slideshowBus.emit('next'));
    expect(h.result.current.position).toBe(1);
    tick(4999);
    expect(h.result.current.position).toBe(1);
    tick(1);
    expect(h.result.current.position).toBe(2);
    act(() => slideshowBus.emit('prev'));
    expect(h.result.current.position).toBe(1);
    expect(timers.slideshowTimers()).toBe(1);
  });
});

describe('library changes while playing', () => {
  it('deleting the active photo moves to the following one without a blank', () => {
    const h = mount(ids(5));
    tick(5000);
    expect(h.result.current.currentId).toBe('p1');
    h.rerender({ ids: ['p0', 'p2', 'p3', 'p4'], opts: base });
    expect(h.result.current.currentId).toBe('p2');
    expect(timers.slideshowTimers()).toBe(1);
  });
  it('deleting the last photo while it is current wraps to a valid photo', () => {
    const h = mount(ids(3));
    tick(5000);
    tick(5000);
    expect(h.result.current.currentId).toBe('p2');
    h.rerender({ ids: ['p0', 'p1'], opts: base });
    expect(['p0', 'p1']).toContain(h.result.current.currentId);
  });
  it('deleting every photo leaves an empty, timer-free state and recovers when photos return', () => {
    const h = mount(ids(3));
    h.rerender({ ids: [], opts: base });
    expect(h.result.current.currentId).toBeNull();
    expect(timers.slideshowTimers()).toBe(0);
    h.rerender({ ids: ['n0', 'n1'], opts: base });
    expect(h.result.current.currentId).toBe('n0');
    expect(timers.slideshowTimers()).toBe(1);
  });
  it('a broken photo is skipped and never returns; all broken -> allBroken', () => {
    const h = mount(ids(3));
    act(() => h.result.current.markBroken('p0'));
    expect(h.result.current.currentId).toBe('p1');
    for (let i = 0; i < 6; i++) tick(5000);
    expect(h.result.current.currentId).not.toBe('p0');
    act(() => h.result.current.markBroken('p1'));
    act(() => h.result.current.markBroken('p2'));
    expect(h.result.current.allBroken).toBe(true);
    expect(h.result.current.currentId).toBeNull();
    expect(timers.slideshowTimers()).toBe(0);
  });
  it('toggling shuffle keeps the current photo on screen', () => {
    const h = mount(ids(20));
    tick(5000);
    tick(5000);
    const cur = h.result.current.currentId;
    h.rerender({ ids: ids(20), opts: { ...base, shuffle: true } });
    expect(h.result.current.currentId).toBe(cur);
    h.rerender({ ids: ids(20), opts: { ...base, shuffle: false } });
    expect(h.result.current.currentId).toBe(cur);
  });
  it('2 photos in shuffle mode alternate forever without repeats', () => {
    const h = mount(ids(2), { shuffle: true });
    let last = h.result.current.currentId;
    for (let i = 0; i < 20; i++) {
      tick(5000);
      expect(h.result.current.currentId).not.toBe(last);
      last = h.result.current.currentId;
    }
  });
});

describe('position persists across remounts of the same photo set (schedule interruptions)', () => {
  it('resuming the same ids after unmount continues from the last position instead of restarting at 0', () => {
    const list = ids(6, 'resume');
    const h1 = mount(list);
    tick(5000);
    tick(5000);
    expect(h1.result.current.position).toBe(2);
    h1.unmount();
    // Simulate a schedule switching to CLOCK and back to PHOTOS: a brand-new mount, same photo ids.
    const h2 = mount(list);
    expect(h2.result.current.position).toBe(2);
    expect(h2.result.current.currentId).toBe(h1.result.current.currentId);
  });
  it('a different photo set does not resume a stale position', () => {
    const h1 = mount(ids(6, 'setA'));
    tick(5000);
    h1.unmount();
    const h2 = mount(ids(6, 'setB'));
    expect(h2.result.current.position).toBe(0);
  });
});

describe('accelerated long runs (fake clock, not real elapsed time)', () => {
  const runs: [number, number, number][] = [
    // photos, intervalSec, simulated hours
    [10, 5, 6],
    [100, 10, 12],
    [500, 30, 24],
    [100, 5, 6],
  ];
  for (const [n, interval, hours] of runs) {
    it(`${n} photos at ${interval}s for ${hours} simulated hours: one timer, valid photo, full cycles`, () => {
      const list = ids(n);
      const h = mount(list, { intervalSec: interval });
      const steps = Math.floor((hours * 3600) / interval);
      const seen = new Set<string>();
      for (let i = 0; i < steps; i++) {
        tick(interval * 1000);
        const cur = h.result.current.currentId;
        expect(cur).not.toBeNull();
        seen.add(cur!);
        expect(timers.slideshowTimers()).toBe(1);
      }
      expect(seen.size).toBe(n);
      expect(h.result.current.position).toBe(steps % n);
      h.unmount();
      expect(timers.slideshowTimers()).toBe(0);
    });
  }
  it('500 photos, shuffle, 3 simulated days at 30s: every cycle shows each photo exactly once', () => {
    const list = ids(500);
    const h = mount(list, { intervalSec: 30, shuffle: true });
    const perCycle = new Map<number, Set<string>>();
    const steps = (3 * 24 * 3600) / 30;
    let cycle = 0;
    let lastPos = h.result.current.position;
    perCycle.set(0, new Set([h.result.current.currentId!]));
    for (let i = 0; i < steps; i++) {
      tick(30_000);
      const pos = h.result.current.position;
      if (pos < lastPos) cycle++;
      lastPos = pos;
      if (!perCycle.has(cycle)) perCycle.set(cycle, new Set());
      perCycle.get(cycle)!.add(h.result.current.currentId!);
      expect(timers.slideshowTimers()).toBe(1);
    }
    for (const [c, set] of perCycle) if (c < cycle) expect(set.size).toBe(500);
    expect(cycle).toBeGreaterThanOrEqual(17);
  });
});
