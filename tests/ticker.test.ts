// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { startTicker, stopTicker, minuteStore, tickNow } from '@/services/ticker';

afterEach(() => {
  stopTicker();
  vi.useRealTimers();
});

describe('minute ticker', () => {
  it('fires once per minute boundary with a single timer and re-arms itself', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15, 10, 0, 30));
    startTicker();
    expect(vi.getTimerCount()).toBe(1);
    let fired = 0;
    const unsub = minuteStore.subscribe(() => fired++);
    vi.advanceTimersByTime(29_000);
    expect(fired).toBe(0);
    vi.advanceTimersByTime(1_100);
    expect(fired).toBe(1);
    expect(minuteStore.get().getMinutes()).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(60_000);
    expect(fired).toBe(2);
    expect(minuteStore.get().getMinutes()).toBe(2);
    startTicker(); // idempotent
    expect(vi.getTimerCount()).toBe(1);
    stopTicker();
    expect(vi.getTimerCount()).toBe(0);
    unsub();
  });
  it('re-evaluates immediately when the page becomes visible again and on tickNow()', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15, 10, 0, 30));
    startTicker();
    const before = minuteStore.get();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(minuteStore.get()).not.toBe(before);
    expect(vi.getTimerCount()).toBe(1);
    const mid = minuteStore.get();
    tickNow();
    expect(minuteStore.get()).not.toBe(mid);
  });
  it('catches up after a long sleep: the delayed timer fires and re-arms to the next boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15, 10, 0, 0));
    startTicker();
    // Simulate the Mac sleeping for 3 hours: the pending timer fires late.
    vi.setSystemTime(new Date(2026, 8, 15, 13, 7, 20));
    vi.runOnlyPendingTimers();
    expect(minuteStore.get().getHours()).toBe(13);
    expect(vi.getTimerCount()).toBe(1);
    // The next tick is aligned to the next real minute boundary after the catch-up value.
    const caughtUp = minuteStore.get();
    const untilNext = 60_000 - (caughtUp.getSeconds() * 1000 + caughtUp.getMilliseconds());
    vi.advanceTimersByTime(untilNext - 10);
    expect(minuteStore.get()).toBe(caughtUp);
    vi.advanceTimersByTime(100);
    expect(minuteStore.get().getMinutes()).toBe((caughtUp.getMinutes() + 1) % 60);
    expect(vi.getTimerCount()).toBe(1);
  });
});
