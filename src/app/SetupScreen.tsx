import { useState, type FormEvent } from 'react';
import { updateSettings } from '@/services/dataService';
import { viewStore, settingsStore } from '@/app/stores';
import { useStore } from '@/app/store';
import { Field, TextInput, Button } from '@/components/ui';

export function SetupScreen() {
  const settings = useStore(settingsStore);
  const [name, setName] = useState(settings.frameName || 'Living Room Frame');
  const [busy, setBusy] = useState(false);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    const frameName = name.trim() || 'Living Room Frame';
    setBusy(true);
    try {
      await updateSettings({ frameName, setupComplete: true });
      viewStore.set({ screen: 'manage', tab: 'frame' });
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="setup-screen">
      <form className="setup-card" onSubmit={start}>
        <div className="eyebrow">SMART FAMILY FRAME</div>
        <h1>Set up your frame</h1>
        <Field label="Frame name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Living Room Frame" autoFocus />
        </Field>
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? 'STARTING…' : 'START'}
        </Button>
        <p className="small" style={{ color: 'var(--f-ink-3)', lineHeight: 1.5 }}>
          You are at <strong style={{ color: 'var(--f-ink-2)' }}>{window.location.host}</strong>, which has no frame data yet.
          <br />
          Expected to see your photos? Open the daily frame address from README.md instead.
        </p>
      </form>
    </div>
  );
}
