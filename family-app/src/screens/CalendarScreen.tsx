import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { useFamily } from '@/FamilyContext';
import type { CalendarEvent } from '@shared/types';
import { EmptyState } from '@/components/EmptyState';

const todayKey = () => new Date().toISOString().slice(0, 10);

export function CalendarScreen() {
  const { activeFrameId, displayName } = useFamily();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState('');

  useEffect(() => {
    if (!db || !activeFrameId) {
      setEvents([]);
      return;
    }
    const q = query(collection(db, 'frames', activeFrameId, 'calendarEvents'), orderBy('date', 'asc'));
    return onSnapshot(q, (snap) => setEvents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CalendarEvent, 'id'>) }))));
  }, [activeFrameId]);

  const upcoming = events.filter((e) => e.date >= todayKey());

  const create = async () => {
    if (!db || !activeFrameId || !title.trim()) return;
    const ref = doc(collection(db, 'frames', activeFrameId, 'calendarEvents'));
    const event: Omit<CalendarEvent, 'id'> & { createdByName: string } = {
      title: title.trim(), date, description: '', allDay: !time, createdAt: Date.now(), updatedAt: Date.now(), createdByName: displayName,
      ...(time ? { startTime: time } : {}),
    };
    await setDoc(ref, event);
    setTitle(''); setTime(''); setShowForm(false);
  };

  const remove = async (id: string) => {
    if (!db || !activeFrameId) return;
    await deleteDoc(doc(db, 'frames', activeFrameId, 'calendarEvents', id));
  };

  if (!activeFrameId) return <EmptyState title="No Frame connected" />;

  return (
    <div>
      {showForm ? (
        <div className="card">
          <h2>New event</h2>
          <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} placeholder="All day if empty" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={!title.trim()} onClick={() => void create()}>Save</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary btn-block" style={{ marginBottom: 14 }} onClick={() => setShowForm(true)}>+ New event</button>
      )}

      {upcoming.length === 0 ? (
        <EmptyState title="No upcoming events" />
      ) : (
        <div className="card">
          {upcoming.map((e) => (
            <div className="list-row" key={e.id}>
              <div>
                <div className="title">{e.title}</div>
                <div className="sub">{e.date}{e.startTime ? ` · ${e.startTime}` : ' · All day'}</div>
              </div>
              <button className="btn btn-sm btn-danger" onClick={() => void remove(e.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
