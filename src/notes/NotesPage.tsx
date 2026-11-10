import { useMemo, useState } from 'react';
import type { Note } from '@/types';
import { useStore } from '@/app/store';
import { notesStore, toast } from '@/app/stores';
import { minuteStore } from '@/services/ticker';
import { saveNote, deleteNote, setNotePinned } from '@/services/dataService';
import { Button, Modal, Field, TextInput, TextArea, Toggle, FormErrors, EmptyState, ConfirmDialog } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { validateNote, sortNotes, isWithinDisplayWindow } from './notesLogic';

interface Draft {
  id?: string;
  title: string;
  message: string;
  pinned: boolean;
  displayStart: string;
  displayEnd: string;
}

function NoteModal({ draft, onClose, onDelete }: { draft: Draft; onClose: () => void; onDelete?: () => void }) {
  const [d, setD] = useState(draft);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const errs = validateNote({ title: d.title, message: d.message, displayStart: d.displayStart || undefined, displayEnd: d.displayEnd || undefined });
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      await saveNote({ id: d.id, title: d.title, message: d.message, pinned: d.pinned, displayStart: d.displayStart || undefined, displayEnd: d.displayEnd || undefined });
      toast(d.id ? 'Note updated.' : 'Note added.', 'success');
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={d.id ? 'Edit note' : 'New note'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <Button variant="ghost" icon="trash" className="left" onClick={onDelete}>Delete</Button>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <form className="form-stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <FormErrors errors={errors} />
        <Field label="Title">
          <TextInput value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Dinner with family at 8 PM" maxLength={80} />
        </Field>
        <Field label="Message">
          <TextArea value={d.message} onChange={(e) => setD({ ...d, message: e.target.value })} placeholder="Keep it short so it is readable from across the room." maxLength={400} />
        </Field>
        <Toggle checked={d.pinned} onChange={(v) => setD({ ...d, pinned: v })} label="Show on the frame (pinned)" />
        <div className="input-row">
          <Field label="Show from (optional)">
            <TextInput type="date" value={d.displayStart} onChange={(e) => setD({ ...d, displayStart: e.target.value })} />
          </Field>
          <Field label="Show until (optional)">
            <TextInput type="date" value={d.displayEnd} onChange={(e) => setD({ ...d, displayEnd: e.target.value })} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export function NotesPage() {
  const notes = useStore(notesStore);
  const now = useStore(minuteStore);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
  const sorted = useMemo(() => sortNotes(notes), [notes]);

  const edit = (n: Note) => setDraft({ id: n.id, title: n.title, message: n.message, pinned: n.pinned, displayStart: n.displayStart ?? '', displayEnd: n.displayEnd ?? '' });
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    setDraft(null);
    await deleteNote(id);
    toast('Note deleted.', 'info');
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Notes</h1>
          <p className="sub">Pinned notes appear on the frame in large, readable type.</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon="plus" onClick={() => setDraft({ title: '', message: '', pinned: true, displayStart: '', displayEnd: '' })}>Add note</Button>
        </div>
      </div>
      {sorted.length === 0 ? (
        <EmptyState icon="note" title="No notes yet">
          <p>Leave a message for the family: "Dinner at 8", "Grocery list", "Welcome home!"</p>
          <Button variant="primary" icon="plus" onClick={() => setDraft({ title: '', message: '', pinned: true, displayStart: '', displayEnd: '' })}>Add a note</Button>
        </EmptyState>
      ) : (
        <div className="list">
          {sorted.map((n) => {
            const inWindow = isWithinDisplayWindow(n, now);
            return (
              <div key={n.id} className={`note-card ${n.pinned ? 'pinned' : ''}`}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    {n.pinned && <span className={`chip ${inWindow ? 'accent' : 'warn'}`}><Icon name="pin" /> {inWindow ? 'On frame' : 'Pinned (outside window)'}</span>}
                    {(n.displayStart || n.displayEnd) && <span className="chip">{n.displayStart || '…'} → {n.displayEnd || '…'}</span>}
                  </div>
                  {n.title && <div className="note-title" style={{ marginTop: 8 }}>{n.title}</div>}
                  {n.message && <div className="note-msg">{n.message}</div>}
                </div>
                <div className="li-actions">
                  <Button icon="pin" iconOnly size="sm" aria-label={n.pinned ? 'Unpin' : 'Pin'} title={n.pinned ? 'Unpin' : 'Pin to frame'} variant={n.pinned ? 'primary' : 'default'} onClick={() => void setNotePinned(n.id, !n.pinned)} />
                  <Button icon="edit" iconOnly size="sm" aria-label="Edit" onClick={() => edit(n)} />
                  <Button icon="trash" iconOnly size="sm" aria-label="Delete" onClick={() => setPendingDelete(n)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
      {draft && <NoteModal draft={draft} onClose={() => setDraft(null)} onDelete={draft.id ? () => setPendingDelete(notes.find((n) => n.id === draft.id) ?? null) : undefined} />}
      {pendingDelete && <ConfirmDialog title="Delete note?" message={`"${pendingDelete.title || pendingDelete.message.slice(0, 40)}" will be removed.`} confirmLabel="Delete" danger onConfirm={() => void confirmDelete()} onCancel={() => setPendingDelete(null)} />}
    </div>
  );
}
