import { useEffect } from 'react';
import { useStore } from './store';
import { viewStore, statusStore } from './stores';
import { bootstrap } from '@/services/bootstrap';
import { useReminderEngine } from '@/hooks/useReminderEngine';
import { SetupScreen } from './SetupScreen';
import { ManageLayout } from './ManageLayout';
import { FrameMode } from '@/frame/FrameMode';
import { ReminderOverlay } from '@/reminders/ReminderOverlay';
import { Toasts } from '@/components/Toasts';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { getTvMode } from '@/tv/platform';
import { TvApp } from '@/tv/TvApp';

let bootPromise: Promise<void> | null = null;

export function App() {
  const view = useStore(viewStore);
  const status = useStore(statusStore);
  useReminderEngine(getTvMode() !== 'screensaver');

  useEffect(() => {
    bootPromise ??= bootstrap().catch((e) => {
      console.error('[bootstrap] fatal', e);
      statusStore.set({ ready: true, storage: 'memory', storageError: (e as Error).message, persisted: null });
      viewStore.set({ screen: 'setup', tab: 'frame' });
    });
  }, []);

  if (!status.ready || view.screen === 'loading') {
    return <div className="loading-screen">Smart Family Frame</div>;
  }

  if (getTvMode()) return <ErrorBoundary><TvApp /></ErrorBoundary>;

  return (
    <ErrorBoundary>
      {view.screen === 'setup' && <SetupScreen />}
      {view.screen === 'manage' && <ManageLayout />}
      {view.screen === 'frame' && <FrameMode />}
      <ReminderOverlay />
      <Toasts />
    </ErrorBoundary>
  );
}
