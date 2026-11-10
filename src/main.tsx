import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import './styles/base.css';
import './styles/frame.css';
import { getTvMode } from './tv/platform';

// Offline support: the service worker precaches the app shell and updates itself in the background.
if (!getTvMode()) registerSW({ immediate: true });

window.addEventListener('error', (e) => console.error('[window] uncaught error', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[window] unhandled rejection', e.reason));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
