import { memo, useMemo } from 'react';
import type { FrameModeKind } from '@/types';
import { useStore, useStoreSelector } from '@/app/store';
import { settingsStore, photosStore, eventsStore, notesStore, schedulesStore, activeRemindersStore } from '@/app/stores';
import { minuteStore } from '@/services/ticker';
import { resolveFrameMode, type FrameResolution } from '@/scheduler/scheduler';
import { PhotosMode } from './modes/PhotosMode';
import { ClockMode } from './modes/ClockMode';
import { CalendarMode } from './modes/CalendarMode';
import { NotesMode } from './modes/NotesMode';
import { DashboardMode } from './modes/DashboardMode';
import { NightMode } from './modes/NightMode';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useFrameUnits } from '@/hooks/useFrameUnits';

/** Resolves what the frame should show right now (schedules + override + default). */
export function useFrameResolution(override: FrameModeKind | null): FrameResolution {
  const schedules = useStore(schedulesStore);
  const defaultMode = useStoreSelector(settingsStore, (s) => s.defaultMode);
  const now = useStore(minuteStore);
  const hasActiveReminder = useStoreSelector(activeRemindersStore, (l) => l.length > 0);
  return useMemo(
    () => resolveFrameMode({ schedules, now, defaultMode, override, hasActiveReminder }),
    [schedules, now, defaultMode, override, hasActiveReminder],
  );
}

const ModeView = memo(function ModeView({ mode }: { mode: FrameModeKind }) {
  const settings = useStore(settingsStore);
  const photos = useStore(photosStore);
  const events = useStore(eventsStore);
  const notes = useStore(notesStore);
  switch (mode) {
    case 'PHOTOS':
      return <PhotosMode photos={photos} settings={settings} />;
    case 'CLOCK':
      return <ClockMode settings={settings} />;
    case 'CALENDAR':
      return <CalendarMode events={events} settings={settings} />;
    case 'NOTES':
      return <NotesMode notes={notes} settings={settings} />;
    case 'DASHBOARD':
      return <DashboardMode photos={photos} events={events} notes={notes} settings={settings} />;
    case 'NIGHT':
      return <NightMode settings={settings} />;
    default:
      return <ClockMode settings={settings} />;
  }
});

/**
 * The frame surface: a self-measuring container that renders the resolved mode.
 * Used full-screen by FrameMode and scaled-down in the management "live preview".
 */
export function FrameContent({ override = null, className = '' }: { override?: FrameModeKind | null; className?: string }) {
  const res = useFrameResolution(override);
  const ref = useFrameUnits<HTMLDivElement>();
  return (
    <div ref={ref} className={`frame-root ${res.overlay ? 'has-overlay' : ''} ${className}`} data-mode={res.baseMode}>
      {/* Keyed by mode: a render error in one mode must not wedge the fallback through every later
          schedule change (the boundary itself would otherwise never reset). */}
      <ErrorBoundary compact key={res.baseMode}>
        <ModeView mode={res.baseMode} />
      </ErrorBoundary>
    </div>
  );
}
