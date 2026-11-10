// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TvApp } from '../src/tv/TvApp';
import { getTvMode } from '../src/tv/platform';
import { photosStore, settingsStore, statusStore } from '../src/app/stores';
import { setPaused } from '../src/photos/slideshowBus';
import { DEFAULT_SETTINGS } from '../src/settings/settings';

vi.mock('../src/frame/FrameContent', () => ({
  FrameContent: () => <div data-testid="frame-content">Shared frame content</div>,
  useFrameResolution: () => ({ baseMode: 'PHOTOS' }),
}));
vi.mock('../src/settings/RemoteSharingSection', () => ({ RemoteSharingSection: () => <div>Phone pairing</div> }));
vi.mock('../src/services/dataService', () => ({ updateSettings: vi.fn(async (patch) => settingsStore.set((s) => ({ ...s, ...patch }))) }));
vi.mock('../src/reminders/ReminderOverlay', () => ({ ReminderOverlay: () => <div data-testid="reminder">Reminder</div> }));

function bridge(mode: string) {
  window.SmartFrameAndroid = { getLaunchMode: () => mode, openScreensaverSettings: vi.fn(), closeApp: vi.fn(), setPlaybackActive: vi.fn() };
}
afterEach(() => {
  cleanup(); delete window.SmartFrameAndroid;
  settingsStore.set(DEFAULT_SETTINGS);
  photosStore.set([]); setPaused(false);
  statusStore.set({ ready: true, storage: 'indexeddb', persisted: null });
});

describe('Android TV modes', () => {
  it('does not enable native mode from an ordinary browser', () => { expect(getTvMode()).toBeNull(); });
  it('rejects an unknown bridge mode', () => { bridge('invalid'); expect(getTvMode()).toBeNull(); });
  it('starts the shared display from the app and returns home on Back', async () => {
    bridge('app'); render(<TvApp />);
    fireEvent.click(screen.getByRole('button', { name: /Start frame/ }));
    await waitFor(() => expect(screen.queryByTestId('frame-content')).not.toBeNull());
    expect(settingsStore.get().setupComplete).toBe(true);
    fireEvent(window, new Event('smartframe-back'));
    expect(screen.queryByRole('button', { name: /Start frame/ })).not.toBeNull();
  });
  it('opens the native selector instead of claiming screensaver activation', () => {
    bridge('app'); render(<TvApp />);
    fireEvent.click(screen.getByRole('button', { name: /Use as screensaver/ }));
    expect(window.SmartFrameAndroid?.openScreensaverSettings).toHaveBeenCalledOnce();
  });
  it('releases screen-on when user-started animated playback is paused', async () => {
    bridge('app');
    photosStore.set(['one', 'two'].map((id) => ({ id, filename: id, mimeType: 'image/jpeg', createdAt: 0, favorite: false, size: 10 })));
    render(<TvApp />);
    fireEvent.click(screen.getByRole('button', { name: /Start frame/ }));
    await waitFor(() => expect(window.SmartFrameAndroid?.setPlaybackActive).toHaveBeenLastCalledWith(true));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(window.SmartFrameAndroid?.setPlaybackActive).toHaveBeenLastCalledWith(false);
  });
  it('shows only shared content in a configured screensaver', () => {
    bridge('screensaver'); settingsStore.set({ ...DEFAULT_SETTINGS, setupComplete: true });
    render(<TvApp />);
    expect(screen.queryByTestId('frame-content')).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByTestId('reminder')).toBeNull();
    expect(window.SmartFrameAndroid?.setPlaybackActive).toHaveBeenCalledWith(false);
  });
  it('never exposes setup controls or overwrites settings in an unconfigured screensaver', () => {
    bridge('screensaver'); render(<TvApp />);
    expect(screen.getByText(/Open the app/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(settingsStore.get().setupComplete).toBe(false);
  });
  it('shows recovery guidance when stored content cannot be read', () => {
    bridge('screensaver'); settingsStore.set({ ...DEFAULT_SETTINGS, setupComplete: true });
    statusStore.set({ ready: true, storage: 'memory', persisted: null, storageError: 'Unavailable' });
    render(<TvApp />);
    expect(screen.queryByTestId('frame-content')).toBeNull();
    expect(screen.getByText(/check your stored content/)).toBeTruthy();
  });
});
