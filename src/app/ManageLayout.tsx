import { useStore } from '@/app/store';
import { viewStore, navigate, settingsStore, statusStore, type Tab } from '@/app/stores';
import { Icon, type IconName } from '@/components/Icon';
import { Button } from '@/components/ui';
import { enterFrameMode } from '@/frame/FrameMode';
import { FramePage } from '@/frame/FramePage';
import { PhotosPage } from '@/photos/PhotosPage';
import { CalendarPage } from '@/calendar/CalendarPage';
import { NotesPage } from '@/notes/NotesPage';
import { RemindersPage } from '@/reminders/RemindersPage';
import { SchedulePage } from '@/scheduler/SchedulePage';
import { SettingsPage } from '@/settings/SettingsPage';
import { HouseholdPage } from '@/household/HouseholdPage';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'frame', label: 'Frame', icon: 'frame' },
  { id: 'photos', label: 'Photos', icon: 'photo' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'notes', label: 'Notes', icon: 'note' },
  { id: 'reminders', label: 'Reminders', icon: 'bell' },
  { id: 'household', label: 'Household', icon: 'household' },
  { id: 'schedule', label: 'Schedule', icon: 'schedule' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

function Page({ tab }: { tab: Tab }) {
  switch (tab) {
    case 'frame':
      return <FramePage />;
    case 'photos':
      return <PhotosPage />;
    case 'calendar':
      return <CalendarPage />;
    case 'notes':
      return <NotesPage />;
    case 'reminders':
      return <RemindersPage />;
    case 'household':
      return <HouseholdPage />;
    case 'schedule':
      return <SchedulePage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <FramePage />;
  }
}

export function ManageLayout() {
  const { tab } = useStore(viewStore);
  const frameName = useStore(settingsStore).frameName;
  const status = useStore(statusStore);
  return (
    <div className="manage">
      <aside className="sidebar">
        <div className="brand">
          <div className="eyebrow">Smart Family Frame</div>
          <div className="name">{frameName}</div>
        </div>
        <Button variant="primary" className="enter-frame" icon="fullscreen" onClick={() => void enterFrameMode()}>
          ENTER FRAME MODE
        </Button>
        <nav className="nav" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => navigate(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span>Version 1.0 · Local &amp; offline</span>
          <span>{status.storage === 'indexeddb' ? 'Storage: IndexedDB' : 'Storage: memory only (not saved!)'}</span>
          <span title="Browser storage is tied to this address (including the port). Use the same address every day.">Data for {window.location.host}</span>
        </div>
      </aside>
      <main className="main">
        {status.storageError && <div className="banner" style={{ marginBottom: 20 }}>Storage problem: {status.storageError}. Changes may not be saved.</div>}
        <ErrorBoundary key={tab}>
          <Page tab={tab} />
        </ErrorBoundary>
      </main>
    </div>
  );
}
