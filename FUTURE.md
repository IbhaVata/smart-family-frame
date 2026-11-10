# FUTURE — Smart Family Frame V2 and beyond

V1 is deliberately local-only. This document describes how the same code base grows into a
connected product and moves from the Mac to dedicated hardware. **Nothing here is implemented yet.**

## 1. Guiding architecture

```
┌──────────────────────────┐        ┌───────────────────────────┐        ┌───────────────────┐
│ Phone companion app      │◀──────▶│ Cloud sync service         │◀──────▶│ Frame device       │
│ (iOS/Android, React      │ HTTPS  │ (auth, families, frames,   │ HTTPS/ │ ARM board + LCD    │
│  Native or PWA)          │        │  media store, sync queue)  │  WSS   │ + this web app     │
└──────────────────────────┘        └───────────────────────────┘        └───────────────────┘
```

The frame keeps working **offline-first**: everything it shows comes from its local database; the
cloud only feeds new items into it. That is why V1 already separates:

- **UI** (`src/frame`, pages) from **business logic** (pure modules with tests) — unchanged in V2.
- **Storage** behind `StorageBackend` (`src/storage/backend.ts`) — V2 adds a sync layer on top.
- **Hardware** behind `DisplayController` (`src/services/display`) — V2 provides a real implementation.

## 2. Feature roadmap

| Feature | Approach |
| --- | --- |
| **Phone companion app** | Start as a PWA sharing `src/types` and validation code; later React Native. Screens: pick photos, write notes/reminders, manage frames. |
| **Remote photo upload** | Phone uploads to the cloud media store (resized to 2560 px max + thumbnail). The frame subscribes to its "inbox" and downloads into IndexedDB using the existing `photoRepo.add`. Show a subtle "New photo from Mom" badge in frame mode. |
| **Family members** | A *family* owns frames and members. Roles: owner / member / viewer. Members can be invited by link or QR. Each item carries `createdBy` for attribution on the frame ("Note from Dad"). |
| **Cloud synchronisation** | Outbox/inbox model. Every local write also appends a change record; a sync worker pushes the outbox and pulls the inbox with a cursor. Conflicts: last-writer-wins per field for settings; per-item for events/notes/reminders; photos are immutable (add/delete only). Works with long offline periods. |
| **QR frame pairing** | Frame shows a QR containing a one-time pairing code + frame id. Phone scans, calls `/pair`, the cloud issues the frame a device token. Frame stores the token locally and starts syncing. Re-pairing revokes old tokens. |
| **Multiple frames** | Settings and schedules are per frame; photos and calendar can be shared family-wide with per-frame filters (e.g. "kids' room frame shows only album X"). |
| **Google Calendar** | OAuth on the phone/cloud side, never on the frame. Cloud pulls events and writes them into the family calendar with `source: 'google'`, read-only on the frame. Same for iCloud/Outlook via CalDAV later. |
| **Weather** | Cloud fetches weather for the frame's location (set on the phone) and pushes a small daily/hourly payload; the frame caches it so the dashboard still shows the last forecast offline. |
| **Video** | Short clips (≤ 30 s, H.264/H.265, muted or with volume schedule). Stored like photos; the slideshow gets a `VideoLayer` that plays once then advances. Transcoding happens in the cloud, not on the frame. |
| **Voice notes** | Recorded on the phone, uploaded as AAC/Opus; the frame shows a "play" note card and plays through the speakers, respecting Night mode (muted). |
| **Remote settings** | Settings become a synced document; the phone edits the same `Settings` type. Frame applies changes live (already reactive via `settingsStore`). |
| **OTA updates** | Frame runs the web app from a local HTTP server. The device agent downloads a signed build bundle, verifies the signature, swaps the directory atomically and reloads. Roll back if the new build fails a health check within 60 s. |
| **Device diagnostics** | Device agent reports uptime, temperature, free storage, Wi-Fi signal, app version, last sync, last error to the cloud; visible in the phone app. Frame shows a hidden diagnostics screen (long-press corner). |
| **Presence & light sensors** | PIR/mmWave sensor turns the display on when someone is in the room; ambient light sensor drives brightness; both through `DisplayController`. |

## 3. Target hardware

```
Low-cost ARM board (Raspberry Pi 4/5, Radxa Zero 3, Orange Pi) 
  + 15.6" (or 10.1") IPS LCD 1920×1080 via HDMI/eDP/DSI
  + Wi-Fi (on-board)
  + small stereo speakers (I²S DAC or USB audio)
  + sensors: ambient light (I²C), PIR/mmWave presence (GPIO), optional touch panel
  + Smart Frame software
```

Software stack on the board:

1. **OS:** Debian/Raspberry Pi OS Lite (64-bit), read-only root with overlay, auto-login.
2. **Browser:** Chromium in kiosk mode (`--kiosk --app=http://localhost:4400`), GPU acceleration on,
   screen blanking disabled (`xset s off` / Wayland equivalent). The web app is the same build as
   on the Mac.
3. **Device agent** (small Node or Go service on localhost):
   - serves the built app (replaces `vite preview`),
   - exposes `/display/power`, `/display/brightness`, `/sensors`, `/diagnostics`, `/update`,
   - implements power via HDMI-CEC (`cec-client`), DDC/CI (`ddcutil`), backlight PWM on GPIO or
     panel enable pin; brightness via DDC/CI or PWM,
   - watchdog: restarts Chromium if it stops responding.
4. **`DisplayController` implementation** in the app: `AgentDisplayController` calls the agent over
   `fetch('http://localhost:PORT/display/...')`. Detected at start-up; falls back to
   `BrowserDisplayController` when no agent answers (the Mac case). Night mode then physically
   switches the panel off instead of painting black.
5. **Storage:** IndexedDB on the board's flash is fine for thousands of photos; if needed, the
   agent can offer a filesystem-backed `StorageBackend` via the same interface.
6. **Performance targets** (why V1 avoids heavy libraries): 60 fps crossfades on a Pi 4-class GPU,
   < 200 MB browser memory with 2 000 photos, thumbnails for grids, single timers, no polling.

## 4. Security and privacy

- All cloud traffic over TLS; frame authenticates with a device token issued during pairing.
- Photos are private to the family; signed, short-lived download URLs.
- No third-party analytics on the frame. Diagnostics are opt-in.
- The frame never stores OAuth credentials for Google Calendar; only the cloud does.

## 5. Suggested delivery order

1. **V1.1** — polish on the Mac: albums, per-schedule photo source, photo captions, touch gestures.
2. **V2.0** — cloud sync + phone PWA + QR pairing + remote photos/notes/reminders.
3. **V2.1** — weather, Google Calendar, remote settings, multiple frames.
4. **V3.0** — ARM hardware with device agent, real display power, sensors, OTA, video, voice notes.
