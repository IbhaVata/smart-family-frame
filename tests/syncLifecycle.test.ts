import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSyncLifecycle, type SyncAttempt } from '../src/cloud/syncLifecycle';

afterEach(() => vi.useRealTimers());
describe('sync lifetime and recovery', () => {
  it('retries failed startup, disposes partial setup, and stops retrying after success', async () => {
    vi.useFakeTimers();
    const cleanup = vi.fn();
    const failed = vi.fn();
    const connect = vi.fn(async (attempt: SyncAttempt) => {
      attempt.own(cleanup);
      if (connect.mock.calls.length === 1) throw new Error('Temporary authentication failure');
    });
    const lifecycle = createSyncLifecycle(connect, failed);
    await lifecycle.start();
    expect(failed).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2000);
    expect(connect).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(120000);
    expect(connect).toHaveBeenCalledTimes(2);
    lifecycle.stop();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
  it('disposes resources arriving after their attempt was stopped', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((done) => { resolve = done; });
    const cleanup = vi.fn();
    const failed = vi.fn();
    const lifecycle = createSyncLifecycle(async (attempt) => { await pending; attempt.own(cleanup); attempt.check(); }, failed);
    const startup = lifecycle.start();
    await Promise.resolve();
    lifecycle.stop(); resolve(); await startup;
    expect(cleanup).toHaveBeenCalledOnce();
    expect(failed).not.toHaveBeenCalled();
  });
  it('cancels retry timers when sync stops', async () => {
    vi.useFakeTimers();
    const connect = vi.fn(async () => { throw new Error('Offline'); });
    const lifecycle = createSyncLifecycle(connect, vi.fn());
    await lifecycle.start(); lifecycle.stop();
    await vi.advanceTimersByTimeAsync(120000);
    expect(connect).toHaveBeenCalledOnce();
  });
  it('ignores an old attempt completing after a restart', async () => {
    let old!: SyncAttempt;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const lifecycle = createSyncLifecycle(async (attempt) => { if (!old) { old = attempt; await pending; } }, vi.fn());
    const first = lifecycle.start(); await Promise.resolve();
    await lifecycle.restart();
    expect(old.current()).toBe(false);
    const cleanup = vi.fn(); old.own(cleanup);
    expect(cleanup).toHaveBeenCalledOnce();
    release(); await first; lifecycle.stop();
  });
  it('coalesces repeated starts instead of creating duplicate sessions', async () => {
    const connect = vi.fn(async () => {});
    const lifecycle = createSyncLifecycle(connect, vi.fn());
    await Promise.all([lifecycle.start(), lifecycle.start(), lifecycle.start()]);
    expect(connect).toHaveBeenCalledOnce(); lifecycle.stop();
  });
});
