# Smart Family Frame

A local-first family display with an Android TV app, an Android TV screensaver, and a phone web app.
Photos, clock, calendar, notes, reminders, and daily schedules share the existing display engine.
Video support is planned; the current build supports images.

**Android TV app + screensaver:** see [ANDROID_TV.md](ANDROID_TV.md) for the new Android package,
phone pairing, remote controls, build/install steps and first-build limitations. Build with
`npm run tv:build` from this folder. The Mac/browser workflow below remains available.

> **Looking for cloud sync or the Family phone app?** That's V2, layered on top of everything below
> without changing it — start at [V2_README.md](V2_README.md). WhatsApp sharing is an inactive prototype,
> not part of the supported release. Nothing on this page changes if you never set V2 up: the Frame works
> exactly as described here with zero configuration.

## QUICK START ON MY MAC

The project folder is `~/Desktop/smart-family-frame`. Every command must be run from inside it,
so each line below starts with `cd`. To open Terminal: press **Cmd+Space**, type `Terminal`, press
**Return**. Paste the lines one at a time.

**Daily use — the Acer monitor is the frame (use this normally):**

```bash
cd ~/Desktop/smart-family-frame && npm run frame:acer
```

This builds the app, starts a persistent server, and opens a normal-profile Chrome window on the
Acer (assuming the Acer is arranged to the right of the Mac display). It deliberately reuses your
normal Chrome profile so port-4400 IndexedDB data stays attached. Press ENTER FRAME MODE if needed.
The server keeps running if Terminal closes. On later starts with unchanged code, use
`npm run frame:acer:quick` to skip the build.

The original manual command remains available as `npm run frame`; it requires the Terminal window to
stay open and you must open/move Chrome yourself.

**Development — when the software is being changed:**

```bash
cd ~/Desktop/smart-family-frame && npm run dev
```

Then open **http://localhost:5400** in Chrome. Changes to the code appear instantly.

**First time on a new Mac, or if dependencies are missing:**

```bash
cd ~/Desktop/smart-family-frame && npm install
```

Stop any running server with **Ctrl+C** in its terminal. If something does not work, read `RECOVERY.md`.

### DEVELOPMENT URL vs DAILY FRAME URL — read this once

| | Command | Address | What it serves | Browser data |
| --- | --- | --- | --- | --- |
| **Daily frame** | `npm run frame` | `http://localhost:4400` | Optimised build + offline service worker | **Your real photos and settings live here** |
| **Development** | `npm run dev` | `http://localhost:5400` | Live-reloading development server | A separate sandbox (use demo data) |

Chrome stores IndexedDB **per address, and the port and host name are both part of the address**.
So the two addresses do **not** share photos, calendar, notes, reminders, schedules or settings, and
they never will — that is how browsers work. Always type `localhost` (not `127.0.0.1`), always use a
normal Chrome window (not Incognito), and always the same browser. The app shows which address its
data belongs to on the setup screen, in the sidebar footer ("Data for localhost:4400") and in
Settings → Storage. The ports 4400/5400 were chosen so that no other Vite project on this Mac
(which would use Vite's defaults 5173/4173) can ever share the frame's address or its data.

Recommended rule: **always add real photos and configuration at `http://localhost:4400`**
(daily frame). Treat `:5400` as a scratch area for development. If you ever add things on the wrong
address, Settings → Download backup / Choose backup file moves calendar, notes, reminders,
schedules and settings across; photos must be added again from your original files.

Both ports are fixed (`strictPort`): if a port is busy the command stops with a clear error instead
of silently opening on another port (which would look like your data vanished). See `RECOVERY.md`.

---

A local, offline-first **smart family photo frame** that runs on your Mac and displays on the
Acer PM161Q B1 portable monitor. Photos, clock, date, calendar, notes, reminders and a smart
scheduler that switches the frame between modes automatically through the day.

```
MY MAC  ──(USB-C or HDMI)──▶  Acer PM161Q B1 (15.6" 1920×1080)
   │
   └── runs the Smart Frame software in a browser (this project)
```

No cloud, no account, no internet needed after the first load. Everything is stored on the Mac
inside the browser's local database (IndexedDB).

---

## 1. Requirements

| What | Version | How to get it |
| --- | --- | --- |
| macOS | 13 or newer (tested on macOS 26.6) | — |
| Node.js | 20 or newer (tested with Node 26) | https://nodejs.org (LTS installer) or `brew install node` |
| Browser | Google Chrome recommended (best fullscreen, wake-lock and offline support). Safari and Edge also work. | https://www.google.com/chrome |

Check Node is installed:

```bash
node --version
```

## 2. Commands (all run from `~/Desktop/smart-family-frame`)

| Command | What it does | Address |
| --- | --- | --- |
| `npm install` | Installs dependencies (first time, or after they go missing). `npm ci` does the same from the exact lock file. | — |
| `npm run frame` | **Daily frame.** Builds the optimised app and serves it with the offline service worker. | http://localhost:4400 |
| `npm run frame:acer` | **Recommended Mac + Acer launcher.** Builds, starts a persistent server, and opens a normal-profile Chrome window on the Acer. | http://localhost:4400 |
| `npm run frame:acer:quick` | Same launcher without rebuilding; use after the current build has already passed. | http://localhost:4400 |
| `npm run dev` | Development server with instant reload (no service worker). | http://localhost:5400 |
| `npm run build` | Production build into `dist/` only (no server). | — |
| `npm run preview` | Serves the last `dist/` build without rebuilding. | http://localhost:4400 |
| `npm test` | Runs the automated unit tests. | — |
| `npm run typecheck` | TypeScript check of app, tests and config. | — |

**What is localhost?** It is your own Mac talking to itself. `localhost:4400` means "the program
running on this computer on port 4400". Nothing leaves the Mac, nothing is uploaded, and it works
with Wi-Fi turned off.

## 3. Connect the Acer PM161Q B1

The Acer PM161Q B1 has a **USB-C port** (video + power over one cable) and a **mini-HDMI** port.

**Option A — one USB-C cable (simplest).** Use the USB-C cable that came with the monitor from
a Thunderbolt/USB-C port on the Mac to the monitor. The Mac powers it and sends the picture.

**Option B — HDMI.** Mac (HDMI port or USB-C→HDMI adapter) → mini-HDMI on the Acer. Also plug
the monitor's USB-C/USB power cable into a charger or a Mac USB port for power.

Then on the Mac:

1. **System Settings → Displays.** The Acer appears next to your built-in display.
2. Click the Acer thumbnail. Set **Use as: Extended display** (NOT "Mirror").
3. **Resolution:** choose **1920 × 1080**. If it is not listed, hold the **Option** key while
   clicking "Scaled" (or enable "Show all resolutions") and pick 1920 × 1080.
4. Optionally drag the Acer thumbnail in "Arrange" so it sits where the monitor physically is.

## 4. Put the frame on the Acer

1. Start the daily frame (`cd ~/Desktop/smart-family-frame && npm run frame`) and open http://localhost:4400 in Chrome.
2. Complete the one-time setup: give the frame a name and press **START**.
3. **Drag the Chrome window onto the Acer monitor** (or use Window → Move to Acer PM161Q).
4. In the app press **ENTER FRAME MODE** (big orange button). The browser goes fullscreen on
   the Acer and shows only the frame content: no menus, no scrollbars.
5. **Move the mouse** over the frame to show the controls (previous / pause / next, mode buttons,
   Exit). They hide again after a few seconds and the cursor disappears.
6. Keyboard while in frame mode: `←` / `→` previous/next photo, `Space` pause/resume,
   `Esc` exit frame mode.
7. **To exit:** press **Esc** (or move the mouse and click **Exit**). You are returned to the
   management screen.

> Browsers only allow fullscreen after a click, so frame mode always starts from the button.

### Keep the screen on

While frame mode is running the app asks the browser for a **screen wake lock** (supported in
Chrome/Edge/Safari 16.4+), which stops the display from sleeping. Additionally set:

- System Settings → **Lock Screen** → "Turn display off on power adapter when inactive": **Never**.
- System Settings → **Battery → Options** → "Prevent automatic sleeping on power adapter when the
  display is off": **On** (MacBooks).

See `AUTOSTART.md` for starting the frame automatically after login.

## 5. Features (V1)

- **First-time setup** with frame name.
- **Photos:** add one or many JPG/JPEG/PNG/WEBP files (button or drag-and-drop), grid with
  thumbnails, lightbox, favorite / unfavorite, delete. Unsupported and corrupted files are rejected
  with a clear message. Photo files are stored in IndexedDB, never in localStorage.
- **Slideshow:** automatic, previous/next, pause/resume, sequential or shuffle, loop on/off,
  favorites-only source. Handles 0, 1 or many photos; deleting the current photo; broken images.
  Photos are never stretched (`object-fit: contain`) with a blurred copy behind portrait photos.
- **Photo timer:** 5 s, 10 s, 15 s, 30 s, 1, 2, 5, 10 minutes or a custom number of seconds.
  Changes apply immediately; a single timer is used and cleaned up correctly.
- **Transitions:** crossfade, fade (through black), none; duration adjustable.
- **Clock:** 12 h / 24 h, optional seconds, Digital or Minimal style; only the clock re-renders.
- **Date:** weekday + full date, can be turned off.
- **Calendar:** Today / Upcoming / Month views, create, edit, delete events (all-day or timed).
- **Notes:** create, edit, delete, pin; optional display window (from/until dates). Pinned notes
  appear on the frame in large type.
- **Reminders:** create, edit, delete, enable/disable; repeat None / Daily / Weekly / Monthly /
  Yearly. When due, a large overlay is shown until dismissed (auto-dismisses after 15 minutes).
  Each occurrence fires exactly once, even across reloads.
- **Household:** a local monthly register for staff attendance, recurring deliveries, quantities,
  variable daily amounts, transparent salary calculations, payment status/history and quick daily
  entry. Household payment reminders use the existing reminder engine.
- **Smart scheduler:** time windows per weekday selecting PHOTOS, CLOCK, CALENDAR, NOTES,
  DASHBOARD or NIGHT. Deterministic priority: reminder overlay → manual override → highest-priority
  schedule (tie: shorter window, then name) → default mode. **Cross-midnight windows work**
  (e.g. 23:00 → 06:30). A visual timeline shows the day.
- **Dashboard:** large photo + time, date, next event and pinned note.
- **Night mode:** true-black screen or a dim night clock.
- **Frame mode:** fullscreen, hidden controls, wake lock, Esc to leave. Designed for 1920×1080 and
  scales to 1366×768, 1280×800 and 1920×1200 (all sizes are relative to the frame width).
- **Settings:** everything above, plus backup, restore, reset, demo data.
- **Backup / restore:** JSON file with version, settings, calendar, notes, reminders, schedules and
  the photo list (metadata). Restore validates the file before touching anything.
- **Reset:** wipes all local data after confirmation and returns to setup.
- **Demo data:** sample events, notes, reminders, the example schedule and six locally generated
  sample pictures (no internet).
- **Offline PWA:** the production build registers a service worker that caches the app shell.

## 6. Important notes and limitations

- **Backups do not contain photo files.** The backup JSON lists photo names and metadata only.
  Keep your original photos somewhere safe; after a restore, add them again from Photos.
- **The browser cannot switch the monitor off.** Night mode paints the screen black or shows a dim
  clock; the Acer stays powered. `src/services/display/DisplayController.ts` is the abstraction
  where real power/brightness control will be implemented on the future ARM board.
- **Data lives in the browser profile** you used (Chrome, Safari, ...). Clearing site data or using
  another browser/profile shows an empty frame. The app asks Chrome for "durable" storage so photos
  are not evicted when the disk is full; Chrome grants this once the page is installed as an app
  (AUTOSTART.md, option A) — Settings → Storage shows whether it was granted. Safari may evict data
  of sites not used for 7 days; use Chrome for a frame that runs for weeks. Never use an
  Incognito/Private window: it still shows "IndexedDB" but throws everything away when it closes.
- **Offline:** the service worker is only installed by the daily frame build (`npm run frame` /
  `npm run preview` at http://localhost:4400), not by `npm run dev`. Verified in Chrome: after one
  load, the app opens and works with its stored data even when the server is not running.
- **Development and daily data are separate** (different ports = different browser storage). See
  "DEVELOPMENT URL vs DAILY FRAME URL" at the top.
- **Time zone:** the frame uses the Mac's local time.
- **Wake lock** needs a browser that supports it and a visible tab; otherwise set the Mac display
  sleep to Never.
- A reminder that becomes due while the app is closed is shown if the app is opened within 10 minutes
  of its time (grace window); otherwise it is skipped (and repeats normally next time).

## 7. Project structure

```
index.html                  App shell
vite.config.ts              Vite + PWA (service worker, manifest) + Vitest config
public/                     Icons and manifest assets
scripts/gen-icons.mjs       Generates the PNG icons (no native deps)
src/
  main.tsx                  Entry point, service-worker registration
  app/                      App root, screens (setup / manage / frame), navigation, stores
  components/               Shared UI (buttons, modal, toggle, toasts, icons, error boundary)
  frame/                    Frame mode: fullscreen screen, mode resolver, the six display modes
  photos/                   Photo library page, slideshow logic (pure) + hook + component
  clock/                    Clock formatting (pure) and clock components
  calendar/                 Calendar logic (pure) and page
  notes/                    Notes logic (pure) and page
  reminders/                Recurrence + due logic (pure), page, overlay
  scheduler/                Scheduling rules (pure), page with timeline
  settings/                 Settings defaults/validation, backup format, settings page
  household/                Household calculations, monthly calendar, quick entry and payments
  storage/                  IndexedDB (idb) with in-memory fallback, repositories
  services/                 Data services, photo import/object-URL cache, ticker, demo data,
                            display/hardware abstraction, bootstrap
  hooks/                    useClock, useFrameUnits, useReminderEngine
  types/                    Domain types
  utils/                    Time/date, file validation, ids
  cloud/                    V2 — optional cloud sync engine (pairing, photo/content sync, heartbeat)
tests/                      Vitest unit tests (business logic)
QA_CHECKLIST.md             Manual test plan
HOUSEHOLD_REAL_WORLD_TEST.md Manual Household and real-monitor checklist
RELIABILITY_REPORT.md       Verified V1 reliability evidence and remaining checks
AUTOSTART.md                Starting the frame automatically on the Mac
RECOVERY.md                 What to do when something goes wrong (restart, ports, reinstall)
FUTURE.md                   V2 architecture (phone app, cloud sync, ARM hardware) — now implemented, see V2_README.md

--- V2 additions (see V2_README.md) ---
shared/                      Household calc engine + V2 types shared by the Frame, functions/, family-app/
functions/                   Cloud Functions (pairing, membership, photos, settings; WhatsApp prototype)
family-app/                  Family PWA — separate Vite project
firebase-tests/              Security rules test suite (real Firestore/Storage emulators)
firestore.rules, storage.rules, firestore.indexes.json, firebase.json
```

**Design for portability:** UI (React), business logic (pure TypeScript modules with tests),
storage (`StorageBackend` interface) and hardware (`DisplayController` interface) are separate, so
the same code can run in a kiosk browser on an ARM board with only the storage/display adapters
swapped.

## 8. Tests

```bash
npm test
```

Covers: slideshow next/previous/shuffle/reconcile, photo interval validation, scheduler daytime,
cross-midnight, overlaps and disabled schedules, reminder repeats (daily/weekly/monthly/yearly),
due detection and no double-firing, settings normalisation, clock/date formatting, calendar and
notes logic, household salary/delivery/payment calculations, backup/restore and storage behavior.

## 9. Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm: command not found` | Install Node.js from nodejs.org, then reopen Terminal. |
| `Missing script: "dev"` | You are in the wrong folder. Run `cd ~/Desktop/smart-family-frame` first. |
| Port 5400/4400 already in use | The frame server is probably already running: open http://localhost:4400. Otherwise see "Port already in use" in RECOVERY.md. |
| Setup screen / no photos although you added some | You opened a different address (other port, `127.0.0.1`, Incognito, or another browser). Use http://localhost:4400 in normal Chrome for daily use. |
| Fullscreen does not start | Click ENTER FRAME MODE again (fullscreen needs a click). Check the browser did not block it. |
| Frame shows "No photos yet" | Add photos in Photos, or Settings → Load demo data. |
| Storage shows "memory only" | The browser has no working IndexedDB (site data blocked in Chrome settings). Allow site data for localhost and use a normal Chrome window. |
| Photos vanished after closing Chrome | You used an Incognito/Private window; its data is deleted when it closes. Always use a normal Chrome window. |
| Photos disappeared | Site data was cleared or another browser profile is in use. Restore from your original files. |
| Frame is dark at night | That is Night mode from the schedule; open Schedule to change or disable it. |

## CI and public source

The public repository contains a clean source snapshot; prior local history and machine-specific
configuration stay local. Copy `.firebaserc.example` to `.firebaserc` and configure your own Firebase
project before deploying. Copy the `.env.example` files for client configuration. Server credentials,
real environment files, cached family data, APK signing keys, and generated builds are not tracked.

CI checks the frame, phone app and backend, exercises Firebase rules against local emulators, builds
the TV APK, runs TV emulator tests, scans history for credentials, and rejects high/critical dependency
advisories. CI does not deploy services or publish an app. See [BUG_HUNT_REPORT.md](BUG_HUNT_REPORT.md)
for the fixes, validation boundaries, and remaining work.
