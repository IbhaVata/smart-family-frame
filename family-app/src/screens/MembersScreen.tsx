import { useState } from 'react';
import { useFamily } from '@/FamilyContext';
import { revokeMember } from '@/lib/api';
import type { ScreenName } from '@/App';

export function MembersScreen({ push }: { push: (s: ScreenName) => void }) {
  const { familyId, members, isOwner, uid } = useFamily();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const revoke = async (memberUid: string) => {
    if (!familyId) return;
    if (!window.confirm('Remove this member? They will lose access to send photos or updates, but anything already on the Frame stays.')) return;
    setBusy(memberUid);
    setError(null);
    try {
      await revokeMember({ familyId, memberUid });
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\w+\/[\w-]+:\s*/, '') : 'Could not remove that member.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="card">
        {members.filter((m) => m.status === 'ACTIVE').map((m) => (
          <div className="list-row" key={m.uid}>
            <div>
              <div className="title">{m.displayName} {m.uid === uid && '(you)'}</div>
              <div className="sub">{m.role === 'OWNER' ? 'Owner' : 'Member'}</div>
            </div>
            {isOwner && m.role !== 'OWNER' && (
              <button className="btn btn-sm btn-danger" disabled={busy === m.uid} onClick={() => void revoke(m.uid)}>Remove</button>
            )}
          </div>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
      <p className="muted">To invite someone new, go to the Frame's Settings → Remote Sharing → Pair New Member, and have them enter the code here.</p>
      <button className="btn btn-block" onClick={() => push('pairFrame')}>I have a code</button>
    </div>
  );
}
