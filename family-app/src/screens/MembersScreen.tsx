import { useState } from 'react';
import { useFamily } from '@/FamilyContext';
import { createFamilyInvite, revokeMember } from '@/lib/api';
import { inviteLink, inviteMessage } from '@/lib/invite';
import type { ScreenName } from '@/App';

export function MembersScreen({ push }: { push: (s: ScreenName) => void }) {
  const { familyId, members, isOwner, uid } = useFamily();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ link: string; message: string } | null>(null);
  const [inviting, setInviting] = useState(false);

  const makeInvite = async () => {
    if (!familyId) return;
    setInviting(true);
    setError(null);
    try {
      const res = await createFamilyInvite({ familyId });
      const link = inviteLink(res.token);
      setInvite({ link, message: inviteMessage(res.familyName, link) });
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\w+\/[\w-]+:\s*/, '') : 'Could not create an invite link.');
    } finally {
      setInviting(false);
    }
  };

  const copyInvite = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.message);
      setError(null);
      window.alert('Invite copied. Paste it into any chat.');
    } catch {
      setError('Could not copy. Long-press the link above to copy it.');
    }
  };

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
      {isOwner && (
        <div className="card">
          <div className="title">Invite family</div>
          <p className="muted">Send a link on WhatsApp. They tap it, sign in once, and can send photos to your TV. The link works for 7 days and can go to a family group.</p>
          {!invite ? (
            <button className="btn btn-primary btn-block" disabled={inviting} onClick={() => void makeInvite()}>
              {inviting ? 'Creating link…' : 'Create invite link'}
            </button>
          ) : (
            <>
              <p className="small" style={{ wordBreak: 'break-all' }}>{invite.link}</p>
              <a className="btn btn-primary btn-block" href={`https://wa.me/?text=${encodeURIComponent(invite.message)}`} target="_blank" rel="noopener noreferrer">
                Share on WhatsApp
              </a>
              <button className="btn btn-block" onClick={() => void copyInvite()}>Copy invite</button>
            </>
          )}
        </div>
      )}
      <button className="btn btn-block" onClick={() => push('pairFrame')}>Connect a new TV</button>
    </div>
  );
}
