import type { Note } from '@/types';
import { parseDateKey, startOfDay, isValidDateKey } from '@/utils/time';

/** True if the note should appear on the frame right now: pinned, and inside its display window (if any). */
export function isNoteDisplayable(note: Note, now: Date): boolean {
  if (!note.pinned) return false;
  return isWithinDisplayWindow(note, now);
}

export function isWithinDisplayWindow(note: Pick<Note, 'displayStart' | 'displayEnd'>, now: Date): boolean {
  const today = startOfDay(now).getTime();
  if (note.displayStart) {
    const s = parseDateKey(note.displayStart);
    if (s && today < s.getTime()) return false;
  }
  if (note.displayEnd) {
    const e = parseDateKey(note.displayEnd);
    if (e && today > e.getTime()) return false;
  }
  return true;
}

/** Notes for the frame: pinned + inside window, newest updated first. */
export function frameNotes(notes: Note[], now: Date): Note[] {
  return notes.filter((n) => isNoteDisplayable(n, now)).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Management list: pinned first, then newest first. */
export function sortNotes(notes: Note[]): Note[] {
  return notes.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

export interface NoteInput {
  title: string;
  message: string;
  displayStart?: string;
  displayEnd?: string;
}

export function validateNote(input: NoteInput): string[] {
  const errors: string[] = [];
  if (!input.title.trim() && !input.message.trim()) errors.push('Write a title or a message.');
  if (input.displayStart && !isValidDateKey(input.displayStart)) errors.push('"Show from" must be a valid date.');
  if (input.displayEnd && !isValidDateKey(input.displayEnd)) errors.push('"Show until" must be a valid date.');
  if (input.displayStart && input.displayEnd && isValidDateKey(input.displayStart) && isValidDateKey(input.displayEnd)) {
    if (input.displayStart > input.displayEnd) errors.push('"Show from" must be before "Show until".');
  }
  return errors;
}
