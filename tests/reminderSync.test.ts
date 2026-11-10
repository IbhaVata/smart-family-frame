import { describe, expect, it } from 'vitest';
import { parseRemoteReminder } from '../src/cloud/reminderSync';
import { reminder, at } from './helpers';

describe('remote reminder trigger memory', () => {
  const existing = { ...reminder({ date: '2026-11-10', time: '09:00', repeat: 'DAILY' }), lastTriggeredAt: at('2026-11-10', '09:00').getTime() };
  it('keeps a dismissed occurrence across remote text changes and reconnects', () => {
    expect(parseRemoteReminder(existing.id, { ...existing, title: 'Updated title', lastTriggeredAt: null }, existing)?.lastTriggeredAt).toBe(existing.lastTriggeredAt);
  });
  it('allows a genuinely different reminder time to fire', () => {
    expect(parseRemoteReminder(existing.id, { ...existing, time: '09:05' }, existing)?.lastTriggeredAt).toBeNull();
  });
  it('rejects malformed cloud data', () => {
    expect(parseRemoteReminder('broken', { title: 'Missing date/time' })).toBeNull();
  });
});
