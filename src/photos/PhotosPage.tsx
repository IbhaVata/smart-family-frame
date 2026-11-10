import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import type { PhotoMeta } from '@/types';
import { useStore } from '@/app/store';
import { photosStore, toast } from '@/app/stores';
import { importPhotos, deletePhoto, setFavorite, acquireThumbUrl, releaseThumbUrl, acquirePhotoUrl, releasePhotoUrl } from '@/services/photoService';
import { Button, Segmented, EmptyState, ConfirmDialog } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { formatBytes, SUPPORTED_EXTENSIONS } from '@/utils/files';

const ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

function useObjectUrl(id: string, kind: 'thumb' | 'full'): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const acquire = kind === 'thumb' ? acquireThumbUrl : acquirePhotoUrl;
    const release = kind === 'thumb' ? releaseThumbUrl : releasePhotoUrl;
    setUrl(null);
    acquire(id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
      release(id);
    };
  }, [id, kind]);
  return url;
}

function PhotoTile({ photo, onOpen, onDelete }: { photo: PhotoMeta; onOpen: () => void; onDelete: () => void }) {
  const url = useObjectUrl(photo.id, 'thumb');
  return (
    <div className="photo-tile" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()} aria-label={photo.filename}>
      {url ? <img src={url} alt="" loading="lazy" /> : null}
      {photo.favorite && (
        <span className="tile-fav">
          <Icon name="heart-filled" />
        </span>
      )}
      <div className="tile-name">{photo.filename}</div>
      <div className="tile-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className={`tile-btn ${photo.favorite ? 'on' : ''}`} title={photo.favorite ? 'Unfavorite' : 'Favorite'} aria-label="Favorite" onClick={() => void setFavorite(photo.id, !photo.favorite)}>
          <Icon name={photo.favorite ? 'heart-filled' : 'heart'} />
        </button>
        <button type="button" className="tile-btn" title="Delete" aria-label="Delete" onClick={onDelete}>
          <Icon name="trash" />
        </button>
      </div>
    </div>
  );
}

function Lightbox({ photos, index, onClose, onIndex, onDelete }: { photos: PhotoMeta[]; index: number; onClose: () => void; onIndex: (i: number) => void; onDelete: (p: PhotoMeta) => void }) {
  const photo = photos[index];
  const url = useObjectUrl(photo?.id ?? '', 'full');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex((index + 1) % photos.length);
      if (e.key === 'ArrowLeft') onIndex((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onClose, onIndex]);
  if (!photo) return null;
  return (
    <div className="lightbox" role="dialog" aria-label={photo.filename}>
      <div className="lb-bar">
        <strong>{photo.filename}</strong>
        <span className="faint">
          {photo.width && photo.height ? `${photo.width}×${photo.height} · ` : ''}
          {formatBytes(photo.size)} · {index + 1} / {photos.length}
        </span>
        <span className="spacer" />
        <Button icon={photo.favorite ? 'heart-filled' : 'heart'} onClick={() => void setFavorite(photo.id, !photo.favorite)}>
          {photo.favorite ? 'Favorited' : 'Favorite'}
        </Button>
        <Button icon="trash" onClick={() => onDelete(photo)}>Delete</Button>
        <Button icon="close" iconOnly aria-label="Close" onClick={onClose} />
      </div>
      {url && <img src={url} alt={photo.filename} />}
      {photos.length > 1 && (
        <>
          <button type="button" className="lb-nav prev" aria-label="Previous" onClick={() => onIndex((index - 1 + photos.length) % photos.length)}>
            <Icon name="prev" />
          </button>
          <button type="button" className="lb-nav next" aria-label="Next" onClick={() => onIndex((index + 1) % photos.length)}>
            <Icon name="next" />
          </button>
        </>
      )}
    </div>
  );
}

export function PhotosPage() {
  const photos = useStore(photosStore);
  const [filter, setFilter] = useState<'all' | 'favorites'>('all');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PhotoMeta | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const visible = filter === 'favorites' ? photos.filter((p) => p.favorite) : photos;
  const totalBytes = photos.reduce((s, p) => s + p.size, 0);

  useEffect(() => {
    if (!navigator.storage?.estimate) return;
    navigator.storage
      .estimate()
      .then((e) => setUsage({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
      .catch(() => undefined);
  }, [photos.length]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const result = await importPhotos(files);
      if (result.added.length) toast(`Added ${result.added.length} photo${result.added.length > 1 ? 's' : ''}.`, 'success');
      for (const r of result.rejected.slice(0, 4)) toast(r.reason, 'error', 7000);
      if (result.rejected.length > 4) toast(`${result.rejected.length - 4} more files were skipped.`, 'error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void handleFiles(e.dataTransfer.files);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    await deletePhoto(id);
    if (open !== null) {
      const remaining = visible.filter((p) => p.id !== id);
      if (remaining.length === 0) setOpen(null);
      else setOpen(Math.min(open, remaining.length - 1));
    }
    toast('Photo deleted.', 'info');
  };

  return (
    <div className={`page dropzone ${drag ? 'drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
      <div className="page-header">
        <div>
          <h1>Photos</h1>
          <p className="sub">
            {photos.length} photo{photos.length === 1 ? '' : 's'} · {formatBytes(totalBytes)}
            {usage && usage.quota > 0 ? ` · ${formatBytes(usage.usage)} of ${formatBytes(usage.quota)} browser storage used` : ''}
          </p>
        </div>
        <div className="page-actions">
          <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'favorites', label: 'Favorites' }]} />
          <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => e.target.files && void handleFiles(e.target.files)} />
          <Button variant="primary" icon="upload" onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? 'Adding…' : 'Add photos'}
          </Button>
        </div>
      </div>

      {photos.length === 0 ? (
        <EmptyState icon="photo" title="Add your first photos">
          <p>Drag photos here or click Add photos. Supported: {SUPPORTED_EXTENSIONS.join(', ')}.</p>
          <Button variant="primary" icon="upload" onClick={() => fileRef.current?.click()}>Add photos</Button>
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon="heart" title="No favorites yet">
          <p>Tap the heart on a photo to add it to favorites.</p>
        </EmptyState>
      ) : (
        <div className="photo-grid">
          {visible.map((p, i) => (
            <PhotoTile key={p.id} photo={p} onOpen={() => setOpen(i)} onDelete={() => setPendingDelete(p)} />
          ))}
        </div>
      )}

      {open !== null && visible[open] && <Lightbox photos={visible} index={open} onClose={() => setOpen(null)} onIndex={setOpen} onDelete={setPendingDelete} />}
      {pendingDelete && (
        <ConfirmDialog title="Delete photo?" message={`"${pendingDelete.filename}" will be removed from the frame. This cannot be undone.`} confirmLabel="Delete" danger onConfirm={() => void confirmDelete()} onCancel={() => setPendingDelete(null)} />
      )}
    </div>
  );
}
