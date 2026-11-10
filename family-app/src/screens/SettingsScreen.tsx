import { signOut } from 'firebase/auth';
import { auth } from '@/firebase';
import { useFamily } from '@/FamilyContext';
import type { ScreenName } from '@/App';

export function SettingsScreen({ push }: { push: (s: ScreenName) => void }) {
  const { displayName, isOwner } = useFamily();

  return (
    <div>
      <div className="card">
        <h2>You</h2>
        <p className="title">{displayName}</p>
      </div>

      <div className="card">
        <h2>Family</h2>
        <button className="btn btn-block" style={{ marginBottom: 8 }} onClick={() => push('members')}>Members</button>
        <button className="btn btn-block" style={{ marginBottom: 8 }} onClick={() => push('frames')}>Frames</button>
        <button className="btn btn-block" onClick={() => push('albums')}>Albums</button>
      </div>

      {!isOwner && <p className="muted small">Some settings are available to the family owner only.</p>}

      <button className="btn btn-block" onClick={() => auth && void signOut(auth)}>Sign out</button>
      <p className="muted small" style={{ textAlign: 'center', marginTop: 16 }}>Smart Family Frame · Family App</p>
    </div>
  );
}
