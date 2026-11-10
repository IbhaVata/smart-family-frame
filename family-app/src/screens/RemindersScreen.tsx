import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { useFamily } from '@/FamilyContext';
import type { Reminder, RepeatRule } from '@shared/types';
import { EmptyState } from '@/components/EmptyState';

const REPEATS: RepeatRule[] = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const todayKey = () => new Date().toISOString().slice(0, 10);

export function RemindersScreen() {
  const { activeFrameId } = useFamily();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState('09:00');
  const [repeat, setRepeat] = useState<RepeatRule>('NONE');

  useEffect(() => {
    if (!db || !activeFrameId) {
      setReminders([]);
      return;
    }
    const q = query(collection(db, 'frames', activeFrameId, 'reminders'), orderBy('date', 'asc'));
    return onSnapshot(q, (snap) => setReminders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Reminder, 'id'>) }))));
  }, [activeFrameId]);

  const create = async () => {
    if (!db || !activeFrameId || !title.trim()) return;
    const ref = doc(collection(db, 'frames', activeFrameId, 'reminders'));
    const reminder: Omit<Reminder, 'id'> = { title: title.trim(), message: '', date, time, repeat, enabled: true, lastTriggeredAt: null, createdAt: Date.now(), updatedAt: Date.now() };
    await setDoc(ref, reminder);
    setTitle(''); setShowForm(false);
  };

  const toggle = async (r: Reminder) => {
    if (!db || !activeFrameId) return;
    await updateDoc(doc(db, 'frames', activeFrameId, 'reminders', r.id), { enabled: !r.enabled, updatedAt: Date.now() });
  };

  const remove = async (id: string) => {
    if (!db || !activeFrameId) return;
    await deleteDoc(doc(db, 'frames', activeFrameId, 'reminders', id));
  };

  if (!activeFrameId) return <EmptyState title="No Frame connected" />;

  return (
    <div>
      {showForm ? (
        <div className="card">
          <h2>New reminder</h2>
          <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <select className="input" value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatRule)}>
            {REPEATS.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={!title.trim()} onClick={() => void create()}>Save</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary btn-block" style={{ marginBottom: 14 }} onClick={() => setShowForm(true)}>+ New reminder</button>
      )}

      {reminders.length === 0 ? (
        <EmptyState title="No reminders yet" />
      ) : (
        <div className="card">
          {reminders.map((r) => (
            <div className="list-row" key={r.id}>
              <div>
                <div className="title">{r.title}</div>
                <div className="sub">{r.date} · {r.time} · {r.repeat === 'NONE' ? 'Once' : r.repeat.charAt(0) + r.repeat.slice(1).toLowerCase()}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm" onClick={() => void toggle(r)}>{r.enabled ? 'Disable' : 'Enable'}</button>
                <button className="btn btn-sm btn-danger" onClick={() => void remove(r.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
