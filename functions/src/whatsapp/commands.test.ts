import { describe, expect, it } from 'vitest';
import { parseWhatsAppCommand } from './commands.js';

describe('parseWhatsAppCommand', () => {
  it('parses LINK codes', () => {
    expect(parseWhatsAppCommand('LINK 482913')).toEqual({ type: 'LINK', code: '482913' });
    expect(parseWhatsAppCommand('link 001122')).toEqual({ type: 'LINK', code: '001122' });
  });

  it('rejects malformed LINK codes as UNKNOWN', () => {
    expect(parseWhatsAppCommand('LINK 1234')).toEqual({ type: 'UNKNOWN', raw: 'LINK 1234' });
    expect(parseWhatsAppCommand('LINK abcdef')).toEqual({ type: 'UNKNOWN', raw: 'LINK abcdef' });
  });

  it('parses FRAME and SEND as the same command', () => {
    expect(parseWhatsAppCommand('FRAME Parents')).toEqual({ type: 'FRAME', name: 'Parents' });
    expect(parseWhatsAppCommand('SEND Living Room')).toEqual({ type: 'FRAME', name: 'Living Room' });
  });

  it('parses HELP case-insensitively', () => {
    expect(parseWhatsAppCommand('help')).toEqual({ type: 'HELP' });
    expect(parseWhatsAppCommand('  HELP  ')).toEqual({ type: 'HELP' });
  });

  it('parses household quick commands', () => {
    expect(parseWhatsAppCommand('MAID LEAVE TODAY')).toEqual({ type: 'MAID_LEAVE_TODAY' });
    expect(parseWhatsAppCommand('maid present today')).toEqual({ type: 'MAID_PRESENT_TODAY' });
    expect(parseWhatsAppCommand('MILK DELIVERED')).toEqual({ type: 'MILK_DELIVERED' });
    expect(parseWhatsAppCommand('milk skipped')).toEqual({ type: 'MILK_SKIPPED' });
  });

  it('parses REMIND with an explicit time', () => {
    expect(parseWhatsAppCommand('REMIND 18:30 Take the medicine')).toEqual({ type: 'REMIND', time: '18:30', message: 'Take the medicine' });
    expect(parseWhatsAppCommand('remind 9:05 Call the doctor')).toEqual({ type: 'REMIND', time: '09:05', message: 'Call the doctor' });
  });

  it('rejects REMIND with an invalid or missing time as UNKNOWN', () => {
    expect(parseWhatsAppCommand('REMIND Take the medicine')).toEqual({ type: 'UNKNOWN', raw: 'REMIND Take the medicine' });
    expect(parseWhatsAppCommand('REMIND 25:99 nonsense')).toEqual({ type: 'UNKNOWN', raw: 'REMIND 25:99 nonsense' });
  });

  it('falls back to UNKNOWN for anything unrecognized', () => {
    expect(parseWhatsAppCommand('hello there')).toEqual({ type: 'UNKNOWN', raw: 'hello there' });
    expect(parseWhatsAppCommand('')).toEqual({ type: 'UNKNOWN', raw: '' });
  });
});
