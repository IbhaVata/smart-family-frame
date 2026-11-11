import { useEffect, useState } from 'react';
import { useStore } from '@/app/store';
import { remoteSharingStore } from '@/app/stores';
import { PairingCard } from './RemoteSharingSection';

/** First-screen prompt on an unpaired frame: a ready-to-scan QR code, no menus. Renders nothing once
 *  paired or when the build has no cloud configured. */
export function ConnectPhonePrompt({ className = 'card' }: { className?: string }) {
  const { status, familyId } = useStore(remoteSharingStore);
  // Latch: generating a code restarts sync, which passes through 'connecting'. Unmounting then would
  // discard the code and re-generate on remount in a loop. Only a real pairing (or a cloud-less build)
  // hides the prompt once it has appeared.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (status === 'not_paired') setShown(true);
    else if (familyId || status === 'connected' || status === 'not_configured') setShown(false);
  }, [status, familyId]);
  if (!shown) return null;
  return (
    <div className={className}>
      <h2>Connect your phone</h2>
      <p className="muted">Scan with your phone camera to send photos to this frame.</p>
      <PairingCard auto />
    </div>
  );
}
