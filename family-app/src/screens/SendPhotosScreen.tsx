import { useEffect, useRef, useState } from 'react';
import { ref, uploadBytes } from 'firebase/storage';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, storage } from '@/firebase';
import { useFamily } from '@/FamilyContext';
import { optimizeImageForUpload } from '@/lib/imageOptimize';
import { createPhotoRecord } from '@/lib/api';
import type { CloudAlbum } from '@shared/types';

type ItemStatus = 'pending' | 'optimizing' | 'uploading' | 'done' | 'error';
interface QueueItem {
  file: File;
  status: ItemStatus;
  error?: string;
}

function extFor(mimeType: string): string {
  return mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
}

export function SendPhotosScreen({ onSent }: { onSent: () => void }) {
  const { familyId, frames, activeFrameId, uid } = useFamily();
  const [frameId, setFrameId] = useState(activeFrameId ?? '');
  const [albums, setAlbums] = useState<CloudAlbum[]>([]);
  const [albumId, setAlbumId] = useState<string>('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!db || !familyId) return;
    return onSnapshot(collection(db, 'families', familyId, 'albums'), (snap) => setAlbums(snap.docs.map((d) => d.data() as CloudAlbum)));
  }, [familyId]);

  const pickFiles = (files: FileList | null) => {
    if (!files) return;
    const items: QueueItem[] = Array.from(files)
      .filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type))
      .map((file) => ({ file, status: 'pending' }));
    setQueue((q) => [...q, ...items]);
  };

  const send = async () => {
    if (!storage || !familyId || !frameId || !uid || queue.length === 0) return;
    setSending(true);
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i]!;
      if (item.status === 'done') continue;
      setQueue((q) => q.map((x, idx) => (idx === i ? { ...x, status: 'optimizing' } : x)));
      try {
        const optimized = await optimizeImageForUpload(item.file);
        const ext = extFor(optimized.blob.type || item.file.type);
        const fileId = crypto.randomUUID();
        const storagePath = `families/${familyId}/photos/${frameId}/${fileId}.${ext}`;
        setQueue((q) => q.map((x, idx) => (idx === i ? { ...x, status: 'uploading' } : x)));
        await uploadBytes(ref(storage, storagePath), optimized.blob, {
          contentType: optimized.blob.type || item.file.type, customMetadata: { uploadedBy: uid },
        });
        await createPhotoRecord({
          familyId, frameId, albumId: albumId || null, storagePath,
          filename: item.file.name, mimeType: optimized.blob.type || item.file.type, size: optimized.blob.size,
          width: optimized.width, height: optimized.height,
        });
        setQueue((q) => q.map((x, idx) => (idx === i ? { ...x, status: 'done' } : x)));
      } catch (e) {
        setQueue((q) => q.map((x, idx) => (idx === i ? { ...x, status: 'error', error: e instanceof Error ? e.message : 'Upload failed' } : x)));
      }
    }
    setSending(false);
  };

  const allDone = queue.length > 0 && queue.every((q) => q.status === 'done');

  useEffect(() => {
    if (allDone) {
      const t = setTimeout(onSent, 900);
      return () => clearTimeout(t);
    }
  }, [allDone, onSent]);

  return (
    <div>
      {frames.length > 1 && (
        <div className="card">
          <h2>Destination frame</h2>
          <select className="input" value={frameId} onChange={(e) => setFrameId(e.target.value)}>
            {frames.map((f) => <option key={f.frameId} value={f.frameId}>{f.name}</option>)}
          </select>
        </div>
      )}

      {albums.length > 0 && (
        <div className="card">
          <h2>Album (optional)</h2>
          <select className="input" value={albumId} onChange={(e) => setAlbumId(e.target.value)}>
            <option value="">No album</option>
            {albums.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => pickFiles(e.target.files)} />
      <button className="btn btn-block" onClick={() => inputRef.current?.click()}>Choose photos…</button>

      {queue.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          {queue.map((item, i) => (
            <div key={i} className="list-row">
              <div className="title">{item.file.name}</div>
              <span className={`chip ${item.status === 'done' ? 'ok' : item.status === 'error' ? 'danger' : ''}`}>
                {item.status === 'pending' ? 'Ready' : item.status === 'optimizing' ? 'Preparing…' : item.status === 'uploading' ? 'Sending…' : item.status === 'done' ? 'Sent' : 'Failed'}
              </span>
              {item.status === 'error' && <div className="form-error">{item.error ?? 'Upload failed. Please try again.'}</div>}
            </div>
          ))}
        </div>
      )}

      {allDone ? (
        <p className="form-info">Photo{queue.length > 1 ? 's' : ''} sent ✅</p>
      ) : (
        <button className="btn btn-primary btn-block" disabled={sending || queue.length === 0 || !frameId} onClick={() => void send()}>
          {sending ? 'Sending…' : `Send ${queue.length || ''} photo${queue.length === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  );
}
