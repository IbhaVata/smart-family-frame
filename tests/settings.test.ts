import { describe, it, expect } from 'vitest';
import { normalizeSettings, DEFAULT_SETTINGS } from '@/settings/settings';
import { formatClock, clockParts } from '@/clock/clockFormat';
import { parseHHMM, formatHHMM, parseDateKey, formatClockTime, formatWeekday, formatLongDate, relativeDayLabel, msUntilNextBoundary } from '@/utils/time';
import { validatePhotoFile } from '@/utils/files';
import { isNoteDisplayable, frameNotes } from '@/notes/notesLogic';
import { nextEvent, validateEvent, upcomingEvents } from '@/calendar/calendarLogic';
import type { Note, CalendarEvent } from '@/types';

describe('settings normalization', () => {
  it('returns defaults for empty or garbage input', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ clockFormat: '13h', transition: 'explode', defaultMode: 'PARTY' })).toEqual(DEFAULT_SETTINGS);
  });
  it('keeps valid values and trims the frame name', () => {
    const s = normalizeSettings({ frameName: '  Kitchen  ', clockFormat: '24h', showSeconds: true, transitionMs: 99999, nightModeType: 'black', setupComplete: true });
    expect(s.frameName).toBe('Kitchen');
    expect(s.clockFormat).toBe('24h');
    expect(s.showSeconds).toBe(true);
    expect(s.transitionMs).toBe(5000);
    expect(s.nightModeType).toBe('black');
    expect(s.setupComplete).toBe(true);
  });
});

describe('clock formatting', () => {
  const d = new Date(2026, 8, 15, 16, 5, 9);
  it('formats 12h and 24h', () => {
    expect(formatClock(d, '12h', false)).toBe('4:05 PM');
    expect(formatClock(d, '12h', true)).toBe('4:05:09 PM');
    expect(formatClock(d, '24h', false)).toBe('16:05');
    expect(formatClock(d, '24h', true)).toBe('16:05:09');
    expect(formatClock(new Date(2026, 8, 15, 0, 30), '12h', false)).toBe('12:30 AM');
    expect(formatClock(new Date(2026, 8, 15, 12, 0), '12h', false)).toBe('12:00 PM');
    expect(clockParts(d, '24h').meridiem).toBe('');
  });
});

describe('time helpers', () => {
  it('parses and formats HH:MM', () => {
    expect(parseHHMM('06:30')).toBe(390);
    expect(parseHHMM('23:59')).toBe(1439);
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('6:30')).toBeNull();
    expect(formatHHMM(390)).toBe('06:30');
    expect(formatHHMM(1500)).toBe('01:00');
    expect(formatClockTime('16:00', '12h')).toBe('4:00 PM');
    expect(formatClockTime('16:00', '24h')).toBe('16:00');
  });
  it('rejects invalid dates', () => {
    expect(parseDateKey('2026-02-30')).toBeNull();
    expect(parseDateKey('2026-13-01')).toBeNull();
    expect(parseDateKey('hello')).toBeNull();
    expect(parseDateKey('2026-09-15')?.getDate()).toBe(15);
  });
  it('formats the date line like the spec', () => {
    const d = new Date(2026, 8, 15);
    expect(formatWeekday(d)).toBe('Tuesday');
    expect(formatLongDate(d)).toBe('15 September 2026');
    expect(relativeDayLabel(d, d)).toBe('Today');
    expect(relativeDayLabel(new Date(2026, 8, 16), d)).toBe('Tomorrow');
    expect(relativeDayLabel(new Date(2026, 8, 18), d)).toBe('Friday');
  });
  it('computes time to next boundary', () => {
    expect(msUntilNextBoundary(1000, 1000)).toBe(1000);
    expect(msUntilNextBoundary(1250, 1000)).toBe(750);
  });
});

describe('photo file validation', () => {
  it('accepts jpg/png/webp and rejects others', () => {
    expect(validatePhotoFile({ name: 'a.jpg', type: 'image/jpeg', size: 100 }).ok).toBe(true);
    expect(validatePhotoFile({ name: 'a.JPEG', type: '', size: 100 }).ok).toBe(true);
    expect(validatePhotoFile({ name: 'a.webp', type: 'image/webp', size: 100 }).ok).toBe(true);
    expect(validatePhotoFile({ name: 'a.gif', type: 'image/gif', size: 100 }).ok).toBe(false);
    expect(validatePhotoFile({ name: 'a.heic', type: '', size: 100 }).ok).toBe(false);
    expect(validatePhotoFile({ name: 'a.png', type: 'image/png', size: 0 }).ok).toBe(false);
    expect(validatePhotoFile({ name: 'a.png', type: 'image/png', size: 41 * 1024 * 1024 }).ok).toBe(false);
  });
});

describe('notes on the frame', () => {
  const base: Note = { id: 'n', title: 'Dinner', message: 'at 8', pinned: true, createdAt: 1, updatedAt: 1 };
  const now = new Date(2026, 8, 15, 12);
  it('shows pinned notes within their window', () => {
    expect(isNoteDisplayable(base, now)).toBe(true);
    expect(isNoteDisplayable({ ...base, pinned: false }, now)).toBe(false);
    expect(isNoteDisplayable({ ...base, displayStart: '2026-09-16' }, now)).toBe(false);
    expect(isNoteDisplayable({ ...base, displayEnd: '2026-09-14' }, now)).toBe(false);
    expect(isNoteDisplayable({ ...base, displayStart: '2026-09-15', displayEnd: '2026-09-15' }, now)).toBe(true);
    expect(frameNotes([base, { ...base, id: 'x', pinned: false }], now)).toHaveLength(1);
  });
});

describe('calendar logic', () => {
  const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({ id: 'e', title: 'Doc', date: '2026-09-15', allDay: false, startTime: '16:00', endTime: '17:00', description: '', createdAt: 0, updatedAt: 0, ...over });
  it('finds the next event that has not ended', () => {
    const now = new Date(2026, 8, 15, 12);
    const list = [ev({ id: 'past', startTime: '08:00', endTime: '09:00' }), ev({ id: 'later', startTime: '16:00' }), ev({ id: 'tmrw', date: '2026-09-16', startTime: '09:00' })];
    expect(nextEvent(list, now)?.id).toBe('later');
    expect(nextEvent(list, new Date(2026, 8, 15, 16, 30))?.id).toBe('later');
    expect(nextEvent(list, new Date(2026, 8, 15, 17, 1))?.id).toBe('tmrw');
    expect(nextEvent([ev({ id: 'ad', allDay: true })], new Date(2026, 8, 15, 23, 59))?.id).toBe('ad');
    expect(upcomingEvents(list, now, 30)).toHaveLength(3);
  });
  it('validates events', () => {
    expect(validateEvent({ title: 'x', date: '2026-09-15', allDay: true, description: '' })).toEqual([]);
    expect(validateEvent({ title: '', date: '2026-09-15', allDay: false, startTime: '10:00', endTime: '09:00', description: '' })).toHaveLength(2);
  });
});
