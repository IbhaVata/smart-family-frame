import { useMemo } from 'react';
import type { Note, Settings } from '@/types';
import { frameNotes } from '@/notes/notesLogic';
import { useClock } from '@/hooks/useClock';
import { InlineTime } from '@/clock/ClockDisplay';

export function NotesMode({ notes, settings }: { notes: Note[]; settings: Settings }) {
  const now = useClock(false);
  const visible = useMemo(() => frameNotes(notes, now).slice(0, 4), [notes, now]);
  return (
    <div className="mode notes-mode">
      <div className="mode-label">Notes</div>
      {visible.length === 0 ? (
        <div className="notes-empty">No notes right now.<br />Pin a note to show it here.</div>
      ) : (
        <div className={`notes-grid count-${visible.length}`}>
          {visible.map((n) => (
            <div key={n.id} className="note-big">
              {n.title && <div className="nb-title">{n.title}</div>}
              {n.message && <div className="nb-msg">{n.message}</div>}
            </div>
          ))}
        </div>
      )}
      <InlineTime settings={settings} className="notes-clock" />
    </div>
  );
}
