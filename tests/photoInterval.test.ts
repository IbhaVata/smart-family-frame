import { describe, it, expect } from 'vitest';
import { clampPhotoInterval, normalizeSettings, isPresetInterval, describeInterval, PHOTO_INTERVAL_PRESETS, MIN_PHOTO_INTERVAL_SEC, MAX_PHOTO_INTERVAL_SEC } from '@/settings/settings';

describe('photo interval', () => {
  it('offers the required presets', () => {
    expect(PHOTO_INTERVAL_PRESETS.map((p) => p.seconds)).toEqual([5, 10, 15, 30, 60, 120, 300, 600]);
  });

  it('accepts custom durations in seconds', () => {
    expect(clampPhotoInterval(45)).toBe(45);
    expect(isPresetInterval(45)).toBe(false);
    expect(isPresetInterval(60)).toBe(true);
    expect(describeInterval(45)).toBe('45 seconds');
    expect(describeInterval(180)).toBe('3 minutes');
    expect(describeInterval(600)).toBe('10 minutes');
  });

  it('clamps out-of-range and invalid values', () => {
    expect(clampPhotoInterval(0)).toBe(MIN_PHOTO_INTERVAL_SEC);
    expect(clampPhotoInterval(-5)).toBe(MIN_PHOTO_INTERVAL_SEC);
    expect(clampPhotoInterval(10 ** 9)).toBe(MAX_PHOTO_INTERVAL_SEC);
    expect(clampPhotoInterval(Number.NaN)).toBe(15);
    expect(clampPhotoInterval(12.6)).toBe(13);
  });

  it('persists through settings normalization', () => {
    expect(normalizeSettings({ photoIntervalSec: 300 }).photoIntervalSec).toBe(300);
    expect(normalizeSettings({ photoIntervalSec: '30' }).photoIntervalSec).toBe(30);
    expect(normalizeSettings({ photoIntervalSec: 'abc' }).photoIntervalSec).toBe(15);
  });
});
