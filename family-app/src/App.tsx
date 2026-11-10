import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/useAuth';
import { SignInScreen } from '@/auth/SignInScreen';
import { FamilyProvider, useFamily } from '@/FamilyContext';
import { HomeScreen } from '@/screens/HomeScreen';
import { PhotosScreen } from '@/screens/PhotosScreen';
import { SendPhotosScreen } from '@/screens/SendPhotosScreen';
import { AlbumsScreen } from '@/screens/AlbumsScreen';
import { CalendarScreen } from '@/screens/CalendarScreen';
import { NotesScreen } from '@/screens/NotesScreen';
import { RemindersScreen } from '@/screens/RemindersScreen';
import { HouseholdScreen } from '@/screens/HouseholdScreen';
import { MembersScreen } from '@/screens/MembersScreen';
import { FramesScreen } from '@/screens/FramesScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { PairFrameScreen } from '@/screens/PairFrameScreen';

export type ScreenName = 'home' | 'photos' | 'sendPhotos' | 'albums' | 'calendar' | 'notes' | 'reminders' | 'household' | 'members' | 'frames' | 'settings' | 'pairFrame';

const TABS: { id: ScreenName; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'photos', label: 'Photos', icon: '\u{1F5BC}' },
  { id: 'calendar', label: 'Calendar', icon: '\u{1F4C5}' },
  { id: 'household', label: 'Household', icon: '\u{1F3E0}' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

const TITLES: Record<ScreenName, string> = {
  home: 'Smart Family',
  photos: 'Photos',
  sendPhotos: 'Send Photos',
  albums: 'Albums',
  calendar: 'Calendar',
  notes: 'Notes',
  reminders: 'Reminders',
  household: 'Household',
  members: 'Members',
  frames: 'Your Frames',
  settings: 'Settings',
  pairFrame: 'Pair a Frame',
};

function readCodeFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('code');
}

function AppShell() {
  const { familyId } = useFamily();
  const [stack, setStack] = useState<ScreenName[]>(['home']);
  const current = stack[stack.length - 1]!;

  useEffect(() => {
    // Deep link from the Frame's QR code: https://<family-app>/pair?code=482913
    if (window.location.pathname === '/pair' || readCodeFromUrl()) {
      setStack(['pairFrame']);
    }
  }, []);

  const push = (screen: ScreenName) => setStack((s) => [...s, screen]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const goTab = (screen: ScreenName) => setStack([screen]);

  const isTab = TABS.some((t) => t.id === current);

  if (!familyId && current !== 'pairFrame') {
    return <PairFrameScreen onDone={() => goTab('home')} initialCode={readCodeFromUrl()} />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        {!isTab && (
          <button className="back-btn" onClick={pop} aria-label="Back">
            &#8592;
          </button>
        )}
        <h1>{TITLES[current]}</h1>
      </header>
      <main className="app-main">
        {current === 'home' && <HomeScreen push={push} />}
        {current === 'photos' && <PhotosScreen push={push} />}
        {current === 'sendPhotos' && <SendPhotosScreen onSent={pop} />}
        {current === 'albums' && <AlbumsScreen />}
        {current === 'calendar' && <CalendarScreen />}
        {current === 'notes' && <NotesScreen />}
        {current === 'reminders' && <RemindersScreen />}
        {current === 'household' && <HouseholdScreen />}
        {current === 'members' && <MembersScreen push={push} />}
        {current === 'frames' && <FramesScreen push={push} />}
        {current === 'settings' && <SettingsScreen push={push} />}
        {current === 'pairFrame' && <PairFrameScreen onDone={pop} initialCode={readCodeFromUrl()} />}
      </main>
      <nav className="bottom-nav">
        {TABS.map((t) => (
          <button key={t.id} className={current === t.id ? 'active' : ''} onClick={() => goTab(t.id)}>
            <span className="nav-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  const { loading, user } = useAuth();
  if (loading) {
    return (
      <div className="signin-screen" role="status" aria-live="polite">
        <h1>Smart Family</h1>
        <p className="muted">Opening your family frame…</p>
      </div>
    );
  }
  if (!user) return <SignInScreen />;
  return (
    <FamilyProvider>
      <AppShell />
    </FamilyProvider>
  );
}
