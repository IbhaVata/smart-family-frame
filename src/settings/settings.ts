import type { Settings, FrameModeKind, TransitionStyle, ClockFormat, ClockStyle, NightModeType, SlideshowSource } from '@/types';
import { FRAME_MODES } from '@/types';

export const SETTINGS_VERSION = 1;
export const MIN_PHOTO_INTERVAL_SEC = 3;
export const MAX_PHOTO_INTERVAL_SEC = 24 * 60 * 60;
export const MIN_TRANSITION_MS = 0;
export const MAX_TRANSITION_MS = 5000;

export const PHOTO_INTERVAL_PRESETS: { label: string; seconds: number }[] = [
  { label: '5 seconds', seconds: 5 },
  { label: '10 seconds', seconds: 10 },
  { label: '15 seconds', seconds: 15 },
  { label: '30 seconds', seconds: 30 },
  { label: '1 minute', seconds: 60 },
  { label: '2 minutes', seconds: 120 },
  { label: '5 minutes', seconds: 300 },
  { label: '10 minutes', seconds: 600 },
];

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  frameName: 'Living Room Frame',
  setupComplete: false,
  defaultMode: 'PHOTOS',
  photoIntervalSec: 15,
  shuffle: false,
  loop: true,
  slideshowSource: 'all',
  transition: 'crossfade',
  transitionMs: 900,
  blurBackground: true,
  showClockOnPhotos: true,
  clockFormat: '12h',
  clockStyle: 'digital',
  showSeconds: false,
  showDate: true,
  nightModeType: 'clock',
  showHouseholdOnFrame: false,
};

const TRANSITIONS: TransitionStyle[] = ['fade', 'crossfade', 'none'];
const CLOCK_FORMATS: ClockFormat[] = ['12h', '24h'];
const CLOCK_STYLES: ClockStyle[] = ['digital', 'minimal'];
const NIGHT_TYPES: NightModeType[] = ['black', 'clock'];
const SOURCES: SlideshowSource[] = ['all', 'favorites'];

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value) ? (value as T) : fallback;
}
function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function clampPhotoInterval(seconds: number): number {
  return num(seconds, DEFAULT_SETTINGS.photoIntervalSec, MIN_PHOTO_INTERVAL_SEC, MAX_PHOTO_INTERVAL_SEC);
}

/** Merges any (possibly partial / corrupted / older) settings object with defaults, validating every field. */
export function normalizeSettings(input: unknown): Settings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const frameName = typeof raw.frameName === 'string' && raw.frameName.trim() ? raw.frameName.trim().slice(0, 60) : DEFAULT_SETTINGS.frameName;
  return {
    version: SETTINGS_VERSION,
    frameName,
    setupComplete: bool(raw.setupComplete, DEFAULT_SETTINGS.setupComplete),
    defaultMode: pick<FrameModeKind>(raw.defaultMode, FRAME_MODES, DEFAULT_SETTINGS.defaultMode),
    photoIntervalSec: num(raw.photoIntervalSec, DEFAULT_SETTINGS.photoIntervalSec, MIN_PHOTO_INTERVAL_SEC, MAX_PHOTO_INTERVAL_SEC),
    shuffle: bool(raw.shuffle, DEFAULT_SETTINGS.shuffle),
    loop: bool(raw.loop, DEFAULT_SETTINGS.loop),
    slideshowSource: pick(raw.slideshowSource, SOURCES, DEFAULT_SETTINGS.slideshowSource),
    transition: pick(raw.transition, TRANSITIONS, DEFAULT_SETTINGS.transition),
    transitionMs: num(raw.transitionMs, DEFAULT_SETTINGS.transitionMs, MIN_TRANSITION_MS, MAX_TRANSITION_MS),
    blurBackground: bool(raw.blurBackground, DEFAULT_SETTINGS.blurBackground),
    showClockOnPhotos: bool(raw.showClockOnPhotos, DEFAULT_SETTINGS.showClockOnPhotos),
    clockFormat: pick(raw.clockFormat, CLOCK_FORMATS, DEFAULT_SETTINGS.clockFormat),
    clockStyle: pick(raw.clockStyle, CLOCK_STYLES, DEFAULT_SETTINGS.clockStyle),
    showSeconds: bool(raw.showSeconds, DEFAULT_SETTINGS.showSeconds),
    showDate: bool(raw.showDate, DEFAULT_SETTINGS.showDate),
    nightModeType: pick(raw.nightModeType, NIGHT_TYPES, DEFAULT_SETTINGS.nightModeType),
    showHouseholdOnFrame: bool(raw.showHouseholdOnFrame, DEFAULT_SETTINGS.showHouseholdOnFrame),
  };
}

/** True if the interval matches one of the presets; otherwise it is a "custom" duration. */
export function isPresetInterval(seconds: number): boolean {
  return PHOTO_INTERVAL_PRESETS.some((p) => p.seconds === seconds);
}

export function describeInterval(seconds: number): string {
  const preset = PHOTO_INTERVAL_PRESETS.find((p) => p.seconds === seconds);
  if (preset) return preset.label;
  if (seconds % 60 === 0) return `${seconds / 60} minutes`;
  return `${seconds} seconds`;
}
