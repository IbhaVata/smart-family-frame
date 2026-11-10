import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { useFamily } from '@/FamilyContext';
import type { Note } from '@shared/types';
import { EmptyState } from '@/components/EmptyState';

export function NotesScreen() {
  const { activeFrameId } = useFamily();
  const [notes, setNotes] = useState<Note[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!db || !activeFrameId) {
      setNotes([]);
      return;
    }
    const q = query(collection(db, 'frames', activeFrameId, 'notes'), orderBy('updatedAt', 'desc'));
    return onSnapshot(q, (snap) => setNotes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Note, 'id'>) }))));
  }, [activeFrameId]);

  const create = async () => {
    if (!db || !activeFrameId || !message.trim()) return;
    const ref = doc(collection(db, 'frames', activeFrameId, 'notes'));
    const note: Omit<Note, 'id'> = { title: title.trim(), message: message.trim(), pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
    await setDoc(ref, note);
    setTitle(''); setMessage(''); setShowForm(false);
  };

  const togglePin = async (n: Note) => {
    if (!db || !activeFrameId) return;
    await updateDoc(doc(db, 'frames', activeFrameId, 'notes', n.id), { pinned: !n.pinned, updatedAt: Date.now() });
  };

  const remove = async (id: string) => {
    if (!db || !activeFrameId) return;
    await deleteDoc(doc(db, 'frames', activeFrameId, 'notes', id));
  };

  if (!activeFrameId) return <EmptyState title="No Frame connected" />;

  return (
    <div>
      {showForm ? (
        <div className="card">
          <h2>New note</h2>
          <input className="input" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="input" rows={3} placeholder="Message" value={message} onChange={(e) => setMessage(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={!message.trim()} onClick={() => void create()}>Save</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary btn-block" style={{ marginBottom: 14 }} onClick={() => setShowForm(true)}>+ New note</button>
      )}

      {notes.length === 0 ? (
        <EmptyState title="No notes yet" />
      ) : (
        <div className="card">
          {notes.map((n) => (
            <div className="list-row" key={n.id}>
              <div>
                <div className="title">{n.title || 'Note'} {n.pinned && '📌'}</div>
                <div className="sub">{n.message}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm" onClick={() => void togglePin(n)}>{n.pinned ? 'Unpin' : 'Pin'}</button>
                <button className="btn btn-sm btn-danger" onClick={() => void remove(n.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
