import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { getDownloadURL, ref } from 'firebase/storage';
import { db, storage } from '@/firebase';
import { useFamily } from '@/FamilyContext';
import type { ScreenName } from '@/App';
import type { CloudPhoto, CalendarEvent, Note } from '@shared/types';

function useRecentPhotos(familyId: string | null, frameId: string | null) {
  const [photos, setPhotos] = useState<CloudPhoto[]>([]);
  useEffect(() => {
    if (!db || !familyId || !frameId) {
      setPhotos([]);
      return;
    }
    const q = query(collection(db, 'families', familyId, 'photos'), where('frameId', '==', frameId), orderBy('uploadedAt', 'desc'), limit(6));
    return onSnapshot(q, (snap) => setPhotos(snap.docs.map((d) => d.data() as CloudPhoto)), () => setPhotos([]));
  }, [familyId, frameId]);
  return photos;
}

function PhotoThumb({ photo }: { photo: CloudPhoto }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!storage) return;
    let cancelled = false;
    void getDownloadURL(ref(storage, photo.storagePath)).then((u) => !cancelled && setUrl(u)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [photo.storagePath]);
  return url ? <img src={url} alt={photo.filename} loading="lazy" /> : <div style={{ background: 'var(--border)', borderRadius: 10, aspectRatio: '1' }} />;
}

function useNextEvent(frameId: string | null) {
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  useEffect(() => {
    if (!db || !frameId) {
      setEvent(null);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const q = query(collection(db, 'frames', frameId, 'calendarEvents'), where('date', '>=', today), orderBy('date', 'asc'), limit(1));
    return onSnapshot(q, (snap) => setEvent(snap.empty ? null : (snap.docs[0]!.data() as CalendarEvent)), () => setEvent(null));
  }, [frameId]);
  return event;
}

function usePinnedNote(frameId: string | null) {
  const [note, setNote] = useState<Note | null>(null);
  useEffect(() => {
    if (!db || !frameId) {
      setNote(null);
      return;
    }
    const q = query(collection(db, 'frames', frameId, 'notes'), where('pinned', '==', true), limit(1));
    return onSnapshot(q, (snap) => setNote(snap.empty ? null : (snap.docs[0]!.data() as Note)), () => setNote(null));
  }, [frameId]);
  return note;
}

export function HomeScreen({ push }: { push: (s: ScreenName) => void }) {
  const { displayName, frames, activeFrameId, familyId } = useFamily();
  const activeFrame = frames.find((f) => f.frameId === activeFrameId) ?? null;
  const photos = useRecentPhotos(familyId, activeFrameId);
  const nextEvent = useNextEvent(activeFrameId);
  const pinnedNote = usePinnedNote(activeFrameId);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <p className="muted" style={{ marginBottom: 2 }}>{greeting}, {displayName.split(' ')[0]}</p>
      {activeFrame ? (
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="title" style={{ fontSize: 18 }}>{activeFrame.name}</div>
            <span className={`chip ${activeFrame.status === 'ONLINE' ? 'ok' : ''}`}>{activeFrame.status === 'ONLINE' ? 'Online' : activeFrame.status}</span>
          </div>
          {frames.length > 1 && (
            <button className="btn btn-sm" onClick={() => push('frames')}>Switch ({frames.length})</button>
          )}
        </div>
      ) : (
        <div className="card">
          <p>No Frame connected yet.</p>
          <button className="btn btn-primary btn-block" onClick={() => push('pairFrame')}>Pair a Frame</button>
        </div>
      )}

      <button className="btn btn-primary btn-block" style={{ padding: '16px', fontSize: 17, marginBottom: 14 }} disabled={!activeFrame} onClick={() => push('sendPhotos')}>
        📷 Send Photos
      </button>

      {photos.length > 0 && (
        <div className="card">
          <h2>Recent memories</h2>
          <div className="photo-grid">
            {photos.map((p) => <PhotoThumb key={p.photoId} photo={p} />)}
          </div>
          <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => push('photos')}>See all photos</button>
        </div>
      )}

      {nextEvent && (
        <div className="card">
          <h2>Next event</h2>
          <div className="list-row"><div><div className="title">{nextEvent.title}</div><div className="sub">{nextEvent.date}{nextEvent.startTime ? ` · ${nextEvent.startTime}` : ''}</div></div></div>
        </div>
      )}

      {pinnedNote && (
        <div className="card">
          <h2>Pinned note</h2>
          <div className="title">{pinnedNote.title || 'Note'}</div>
          <p className="muted">{pinnedNote.message}</p>
        </div>
      )}

      <div className="card">
        <h2>Quick links</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => push('albums')}>Albums</button>
          <button className="btn btn-sm" onClick={() => push('notes')}>Notes</button>
          <button className="btn btn-sm" onClick={() => push('reminders')}>Reminders</button>
          <button className="btn btn-sm" onClick={() => push('members')}>Members</button>
          <button className="btn btn-sm" onClick={() => push('frames')}>Frames</button>
        </div>
      </div>
    </div>
  );
}
