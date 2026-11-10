/** Owns one sync attempt, its resources and bounded startup retries. No browser/Firebase dependency. */
export interface SyncAttempt {
  current(): boolean;
  check(): void;
  own(cleanup: () => void): void;
  retry(delayMs?: number): void;
}

export function createSyncLifecycle(connect: (attempt: SyncAttempt) => Promise<void>, onError: (error: unknown) => void) {
  let enabled = false;
  let generation = 0;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let task: Promise<void> | undefined;
  let cleanups: (() => void)[] = [];
  const dispose = () => {
    clearTimeout(timer); timer = undefined;
    const old = cleanups; cleanups = [];
    for (const cleanup of old) { try { cleanup(); } catch { /* Finish releasing other resources. */ } }
  };
  const launch = (): Promise<void> => {
    const id = ++generation;
    dispose();
    const current = () => enabled && generation === id;
    const attempt: SyncAttempt = {
      current,
      check() { if (!current()) throw new Error('Sync attempt superseded.'); },
      own(cleanup) { if (current()) cleanups.push(cleanup); else cleanup(); },
      retry(delayMs) {
        if (!current() || timer !== undefined) return;
        const delay = delayMs ?? Math.min(30_000, 2_000 * 2 ** Math.min(failures++, 4));
        timer = setTimeout(() => { if (current()) void launch(); }, delay);
      },
    };
    task = Promise.resolve().then(() => connect(attempt)).then(() => {
      if (current() && timer === undefined) failures = 0;
    }).catch((error: unknown) => {
      if (!current()) return;
      dispose();
      onError(error);
      attempt.retry();
    });
    return task;
  };
  return {
    start(): Promise<void> {
      if (enabled) return task ?? Promise.resolve();
      enabled = true;
      return launch();
    },
    restart(): Promise<void> { enabled = true; failures = 0; return launch(); },
    stop(): void { enabled = false; ++generation; dispose(); task = undefined; failures = 0; },
  };
}
