import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref } from 'firebase/storage';
import { db, storage } from '@/firebase';
import { useFamily } from '@/FamilyContext';
import type { ScreenName } from '@/App';
import type { CloudPhoto } from '@shared/types';
import { EmptyState } from '@/components/EmptyState';
import { removeSharedPhoto } from '@/lib/removePhoto';

function PhotoTile({ photo, onDelete, disabled, canRemove }: { photo: CloudPhoto; onDelete: (p: CloudPhoto) => void; disabled: boolean; canRemove: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!storage) return;
    let cancelled = false;
    void getDownloadURL(ref(storage, photo.storagePath)).then((u) => !cancelled && setUrl(u)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [photo.storagePath]);
  return (
    <button type="button" disabled={disabled || !canRemove} aria-label={canRemove ? `Remove ${photo.filename}` : photo.filename} style={{ position: 'relative', padding: 0, border: 0, background: 'transparent' }} onClick={() => window.confirm(`Remove ${photo.filename} from this TV? An offline TV will remove it when it reconnects.`) && onDelete(photo)}>
      {url ? <img src={url} alt={photo.filename} loading="lazy" /> : <div style={{ background: 'var(--border)', borderRadius: 10, aspectRatio: '1' }} />}
    </button>
  );
}

export function PhotosScreen({ push }: { push: (s: ScreenName) => void }) {
  const { familyId, activeFrameId, isOwner, uid } = useFamily();
  const [photos, setPhotos] = useState<CloudPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !familyId || !activeFrameId) {
      setPhotos([]);
      return;
    }
    const q = query(collection(db, 'families', familyId, 'photos'), where('frameId', '==', activeFrameId), orderBy('uploadedAt', 'desc'), limit(60));
    return onSnapshot(q, (snap) => setPhotos(snap.docs.map((d) => d.data() as CloudPhoto)));
  }, [familyId, activeFrameId]);

  const remove = async (photo: CloudPhoto) => {
    if (!db || !storage || !familyId || busy) return;
    setBusy(true); setMessage(null);
    try {
      const cleaned = await removeSharedPhoto(familyId, photo, {
        removeMetadata: () => deleteDoc(doc(db!, 'families', familyId, 'photos', photo.photoId)),
        removeBytes: () => deleteObject(ref(storage!, photo.storagePath)),
      });
      if (!cleaned) setMessage('Removed from the TV library. Cloud file cleanup could not finish.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message.replace(/^Firebase:\s*/, '') : 'Could not remove the photo. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button className="btn btn-primary btn-block" style={{ marginBottom: 14 }} onClick={() => push('sendPhotos')}>📷 Send Photos</button>
      {photos.length === 0 ? (
        <EmptyState title="No photos yet" text="Photos you and your family send appear here." />
      ) : (
        <div className="photo-grid">
          {photos.map((p) => <PhotoTile key={p.photoId} photo={p} onDelete={(photo) => void remove(photo)} disabled={busy} canRemove={isOwner || p.uploadedBy === uid} />)}
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>Tap a photo you can manage to remove it from this TV. Offline TVs apply removals when they reconnect.</p>
    </div>
  );
}
