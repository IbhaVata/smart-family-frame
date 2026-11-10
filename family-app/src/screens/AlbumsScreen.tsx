import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { useFamily } from '@/FamilyContext';
import type { CloudAlbum } from '@shared/types';
import { EmptyState } from '@/components/EmptyState';

export function AlbumsScreen() {
  const { familyId, uid } = useFamily();
  const [albums, setAlbums] = useState<CloudAlbum[]>([]);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    if (!db || !familyId) return;
    return onSnapshot(collection(db, 'families', familyId, 'albums'), (snap) => setAlbums(snap.docs.map((d) => d.data() as CloudAlbum)));
  }, [familyId]);

  const create = async () => {
    if (!db || !familyId || !uid || !name.trim()) return;
    const ref = doc(collection(db, 'families', familyId, 'albums'));
    await setDoc(ref, { id: ref.id, familyId, name: name.trim(), createdAt: Date.now(), updatedAt: Date.now(), createdBy: uid });
    setName('');
  };

  const rename = async (id: string) => {
    if (!db || !familyId || !renameValue.trim()) return;
    await updateDoc(doc(db, 'families', familyId, 'albums', id), { name: renameValue.trim(), updatedAt: Date.now() });
    setRenaming(null);
  };

  const remove = async (id: string) => {
    if (!db || !familyId) return;
    if (!window.confirm('Delete this album? Photos inside it are not deleted, they just lose their album.')) return;
    await deleteDoc(doc(db, 'families', familyId, 'albums', id));
  };

  return (
    <div>
      <div className="card">
        <h2>New album</h2>
        <input className="input" placeholder="Album name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary btn-block" disabled={!name.trim()} onClick={() => void create()}>Create album</button>
      </div>

      {albums.length === 0 ? (
        <EmptyState title="No albums yet" text="Create one to group photos when you send them." />
      ) : (
        <div className="card">
          {albums.map((a) => (
            <div className="list-row" key={a.id}>
              {renaming === a.id ? (
                <input className="input" style={{ margin: 0 }} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => void rename(a.id)} autoFocus />
              ) : (
                <div className="title" onClick={() => { setRenaming(a.id); setRenameValue(a.name); }}>{a.name}</div>
              )}
              <button className="btn btn-sm btn-danger" onClick={() => void remove(a.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
