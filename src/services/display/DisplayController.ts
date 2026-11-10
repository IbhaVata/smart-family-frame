/**
 * Hardware/display abstraction.
 *
 * In the browser prototype we can only: request fullscreen, keep the screen awake (Wake Lock API), and
 * paint the screen black. We CANNOT physically power off or dim the Acer monitor from a web page.
 * A future ARM/embedded build implements this same interface with real HDMI-CEC / DDC-CI / GPIO control.
 */

export interface DisplayCapabilities {
  fullscreen: boolean;
  wakeLock: boolean;
  power: boolean;
  brightness: boolean;
}

export interface DisplayController {
  capabilities(): DisplayCapabilities;
  enterFullscreen(element?: HTMLElement): Promise<boolean>;
  exitFullscreen(): Promise<void>;
  isFullscreen(): boolean;
  onFullscreenChange(listener: (isFullscreen: boolean) => void): () => void;
  /** Keeps the display from sleeping while the frame is running. */
  acquireWakeLock(): Promise<boolean>;
  releaseWakeLock(): Promise<void>;
  /** Physical power control - not supported in the browser. */
  setPower(on: boolean): Promise<{ supported: boolean }>;
  /** Physical brightness (0-1) - not supported in the browser. */
  setBrightness(level: number): Promise<{ supported: boolean }>;
}

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener: (t: 'release', cb: () => void) => void };

class BrowserDisplayController implements DisplayController {
  private sentinel: WakeLockSentinelLike | null = null;
  private wantWakeLock = false;
  private pending: Promise<boolean> | null = null;
  private visibilityHandler = () => {
    if (document.visibilityState === 'visible' && this.wantWakeLock && !this.sentinel) {
      void this.acquireWakeLock();
    }
  };

  capabilities(): DisplayCapabilities {
    const d = typeof document !== 'undefined' ? document : null;
    const n = typeof navigator !== 'undefined' ? (navigator as Navigator & { wakeLock?: unknown }) : null;
    return {
      fullscreen: !!d && !!(d.documentElement as { requestFullscreen?: unknown }).requestFullscreen,
      wakeLock: !!n && 'wakeLock' in n,
      power: false,
      brightness: false,
    };
  }

  async enterFullscreen(element: HTMLElement = document.documentElement): Promise<boolean> {
    try {
      if (document.fullscreenElement) return true;
      const el = element as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
      if (el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
        return true;
      }
      if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[display] fullscreen request was refused:', e);
      return false;
    }
  }

  async exitFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    } catch (e) {
      console.warn('[display] exit fullscreen failed:', e);
    }
  }

  isFullscreen(): boolean {
    return !!document.fullscreenElement;
  }

  onFullscreenChange(listener: (isFullscreen: boolean) => void): () => void {
    const handler = () => listener(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }

  async acquireWakeLock(): Promise<boolean> {
    this.wantWakeLock = true;
    document.addEventListener('visibilitychange', this.visibilityHandler);
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } };
    if (!nav.wakeLock) return false;
    if (this.sentinel) return true;
    // Two overlapping calls (visibilitychange firing twice while a request is already in flight,
    // or a StrictMode mount/unmount/mount) would otherwise each obtain a sentinel and only the
    // second's reference survives, orphaning the first (never released). Share one in-flight
    // request instead.
    if (this.pending) return this.pending;
    this.pending = (async () => {
      try {
        const s = await nav.wakeLock!.request('screen');
        if (!this.wantWakeLock) {
          // Released while the request was pending: don't hold onto a lock nobody wants anymore.
          void s.release().catch(() => undefined);
          return false;
        }
        if (this.sentinel) {
          // Another call already won the race; release this redundant one instead of overwriting.
          void s.release().catch(() => undefined);
          return true;
        }
        this.sentinel = s;
        s.addEventListener('release', () => {
          this.sentinel = null;
        });
        return true;
      } catch (e) {
        console.warn('[display] wake lock unavailable:', e);
        return false;
      } finally {
        this.pending = null;
      }
    })();
    return this.pending;
  }

  async releaseWakeLock(): Promise<void> {
    this.wantWakeLock = false;
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    // If a request is still in flight, acquireWakeLock's own pending handler checks wantWakeLock
    // once it resolves and releases the sentinel itself - nothing further to do here for that case.
    if (this.sentinel) {
      try {
        await this.sentinel.release();
      } catch {
        /* ignore */
      }
      this.sentinel = null;
    }
  }

  async setPower(): Promise<{ supported: boolean }> {
    return { supported: false };
  }

  async setBrightness(): Promise<{ supported: boolean }> {
    return { supported: false };
  }
}

export const display: DisplayController = new BrowserDisplayController();
