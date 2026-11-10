/**
 * Deterministic WhatsApp text-command parser (V2 build §56: "prefer a command parser" over an AI model
 * for basic commands — cheap, predictable, testable). Pure function, no Firebase dependency, so it is
 * unit-tested directly (see commands.test.ts) without emulators.
 */
export type WhatsAppCommand =
  | { type: 'LINK'; code: string }
  | { type: 'FRAME'; name: string }
  | { type: 'HELP' }
  | { type: 'MAID_LEAVE_TODAY' }
  | { type: 'MAID_PRESENT_TODAY' }
  | { type: 'MILK_DELIVERED' }
  | { type: 'MILK_SKIPPED' }
  | { type: 'REMIND'; time: string; message: string }
  | { type: 'UNKNOWN'; raw: string };

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseWhatsAppCommand(rawText: string): WhatsAppCommand {
  const text = rawText.trim();
  const upper = text.toUpperCase();

  const link = /^LINK\s+(\d{6})$/i.exec(text);
  if (link) return { type: 'LINK', code: link[1]! };

  const frame = /^(?:FRAME|SEND)\s+(.+)$/i.exec(text);
  if (frame) return { type: 'FRAME', name: frame[1]!.trim() };

  if (upper === 'HELP') return { type: 'HELP' };
  if (upper === 'MAID LEAVE TODAY') return { type: 'MAID_LEAVE_TODAY' };
  if (upper === 'MAID PRESENT TODAY') return { type: 'MAID_PRESENT_TODAY' };
  if (upper === 'MILK DELIVERED') return { type: 'MILK_DELIVERED' };
  if (upper === 'MILK SKIPPED') return { type: 'MILK_SKIPPED' };

  const remind = /^REMIND\s+(\d{1,2}):(\d{2})\s+(.+)$/i.exec(text);
  if (remind) {
    const time = `${remind[1]!.padStart(2, '0')}:${remind[2]!}`;
    if (HHMM_RE.test(time)) return { type: 'REMIND', time, message: remind[3]!.trim() };
  }

  return { type: 'UNKNOWN', raw: text };
}

export const HELP_TEXT = [
  'Smart Family Frame commands:',
  '• Send a photo to add it to your Frame.',
  '• LINK 123456 — connect your WhatsApp using the code shown on the Frame.',
  '• FRAME <name> — choose which Frame photos go to, if you have more than one.',
  '• MAID PRESENT TODAY / MAID LEAVE TODAY',
  '• MILK DELIVERED / MILK SKIPPED',
  '• REMIND 18:30 Take the medicine — sets a reminder on the Frame.',
].join('\n');
