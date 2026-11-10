import { describe, it, expect } from 'vitest';
import { createBackup, validateBackup, parseBackupText, BACKUP_FORMAT, BACKUP_VERSION, backupFilename } from '@/settings/backup';
import { DEFAULT_SETTINGS } from '@/settings/settings';

const good = createBackup({
  settings: { ...DEFAULT_SETTINGS, frameName: 'Kitchen', setupComplete: true },
  events: [{ id: 'e1', title: 'Doctor', date: '2026-09-15', startTime: '16:00', endTime: '17:00', description: '', allDay: false, createdAt: 1, updatedAt: 1 }],
  notes: [{ id: 'n1', title: 'Dinner', message: 'with family at 8 PM', pinned: true, createdAt: 1, updatedAt: 1 }],
  reminders: [{ id: 'r1', title: 'Call Mom', message: '', date: '2026-09-15', time: '19:00', repeat: 'DAILY', enabled: true, lastTriggeredAt: null, createdAt: 1, updatedAt: 1 }],
  schedules: [{ id: 's1', name: 'Night', startTime: '23:00', endTime: '06:30', daysOfWeek: [0, 1, 2, 3, 4, 5, 6], mode: 'NIGHT', enabled: true, priority: 1 }],
  photos: [{ id: 'p1', filename: 'a.jpg', mimeType: 'image/jpeg', createdAt: 1, favorite: false, size: 10 }],
});

describe('backup validation', () => {
  it('round-trips a valid backup', () => {
    const r = validateBackup(JSON.parse(JSON.stringify(good)));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.backup.settings.frameName).toBe('Kitchen');
      expect(r.backup.events).toHaveLength(1);
      expect(r.backup.schedules[0]!.mode).toBe('NIGHT');
      expect(r.backup.includesPhotoBinaries).toBe(false);
      expect(r.warnings.join(' ')).toMatch(/not included/);
    }
    expect(good.format).toBe(BACKUP_FORMAT);
    expect(good.version).toBe(BACKUP_VERSION);
  });

  it('rejects non-backup files', () => {
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup([]).ok).toBe(false);
    expect(validateBackup({ hello: 'world' }).ok).toBe(false);
    expect(parseBackupText('{not json').ok).toBe(false);
  });

  it('rejects newer versions', () => {
    const r = validateBackup({ ...good, version: 99 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/newer version/);
  });

  it('reports invalid entities with useful messages', () => {
    const bad = JSON.parse(JSON.stringify(good));
    bad.events[0].date = '2026-02-30';
    bad.schedules[0].startTime = '25:00';
    bad.reminders[0].repeat = 'SOMETIMES';
    bad.notes.push({ id: 'n1', title: 'dup', message: '', pinned: false, createdAt: 1, updatedAt: 1 });
    const r = validateBackup(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.includes('Event #1') && e.includes('date'))).toBe(true);
      expect(r.errors.some((e) => e.includes('Schedule #1') && e.includes('startTime'))).toBe(true);
      expect(r.errors.some((e) => e.includes('Reminder #1') && e.includes('repeat'))).toBe(true);
      expect(r.errors.some((e) => e.includes('duplicate id'))).toBe(true);
    }
  });

  it('normalizes unknown settings values instead of failing', () => {
    const r = validateBackup({ ...good, settings: { frameName: 'X', clockFormat: 'weird' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.backup.settings.clockFormat).toBe('12h');
  });

  it('tolerates missing optional lists', () => {
    const r = validateBackup({ format: BACKUP_FORMAT, version: 1, settings: {} });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.backup.events).toEqual([]);
  });

  it('builds a safe filename', () => {
    expect(backupFilename('Living Room Frame', new Date(2026, 8, 15))).toBe('living-room-frame-backup-20260915.json');
    expect(backupFilename('***', new Date(2026, 8, 15))).toBe('frame-backup-20260915.json');
  });
});

describe('null description normalization (hand-edited backups)', () => {
  it('normalises a null event description to an empty string instead of passing it through', () => {
    const withNullDescription = JSON.parse(JSON.stringify(good));
    withNullDescription.events[0].description = null;
    const r = validateBackup(withNullDescription);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.backup.events[0]!.description).toBe('');
      // Proves the value can safely be used the way the calendar editor uses it (draft.description.trim()).
      expect(() => r.backup.events[0]!.description.trim()).not.toThrow();
    }
  });
});
