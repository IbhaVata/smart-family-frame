/** Only the Android package exposes this bridge; browser URLs cannot enable native mode. */
export type TvMode = 'app' | 'screensaver';
interface AndroidBridge {
  getLaunchMode(): string;
  openScreensaverSettings(): void;
  closeApp(): void;
  setPlaybackActive(active: boolean): void;
}
declare global {
  interface Window { SmartFrameAndroid?: AndroidBridge }
}
export function getTvMode(): TvMode | null {
  try {
    const mode = window.SmartFrameAndroid?.getLaunchMode();
    return mode === 'app' || mode === 'screensaver' ? mode : null;
  } catch { return null; }
}
export function openScreensaverSettings(): void { window.SmartFrameAndroid?.openScreensaverSettings(); }
export function closeTvApp(): void { window.SmartFrameAndroid?.closeApp(); }
export function setTvPlaybackActive(active: boolean): void { window.SmartFrameAndroid?.setPlaybackActive(active); }
