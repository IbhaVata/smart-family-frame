# RECOVERY — what to do when something goes wrong

Everything runs from one folder on this Mac:

```
~/Desktop/smart-family-frame
```

Every command below starts with `cd ~/Desktop/smart-family-frame` because the commands only work
from inside that folder. (`npm run dev` in any other folder gives "Missing script: dev".)

**To open Terminal:** press **Cmd+Space**, type `Terminal`, press **Return**. Paste one line at a
time and press Return. Stop a running server with **Ctrl+C** in its window.

Your photos, calendar, notes, reminders, schedules and settings are stored by Chrome for the address
**http://localhost:4400** (the daily frame address). They are NOT inside the project folder, so
reinstalling or rebuilding the project never deletes them. Only these things delete them:
"Reset smart frame" in Settings, Chrome's "Clear site data" for localhost, uninstalling the
installed Chrome app with "Also delete data" ticked, or using a Private/Incognito window (its data is
thrown away when the window closes).

**If you set up AUTOSTART.md:** the server starts by itself after login. Then you never need
`npm run frame` — just open http://localhost:4400 in Chrome. See "Port already in use" below.

---

## The Mac restarted

Nothing is lost. Start the frame again:

```bash
cd ~/Desktop/smart-family-frame && npm run frame
```

(Skip this if AUTOSTART is set up; the server is already running.)
Open **http://localhost:4400** in Chrome, move the window to the Acer, press ENTER FRAME MODE.

## The terminal window closed

The server stops when its terminal closes, so the browser shows "This site can't be reached".
Open a new Terminal and run the start command again:

```bash
cd ~/Desktop/smart-family-frame && npm run frame
```

Then reload the browser tab (Cmd+R). Your data is still there.

## The browser closed

Open Chrome again and go to **http://localhost:4400** (start the server first if the terminal was
closed too). Press ENTER FRAME MODE again.

## The app shows the setup screen, or my photos are missing

You are almost certainly at a **different address** than usual. The setup screen itself tells you
which address you are at. Check the address bar:

- `http://localhost:4400` → daily frame data (your real photos).
- `http://localhost:5400` → development data (separate, usually demo photos).
- `http://127.0.0.1:4400` or anything else → a third, empty data set. Always type **localhost**.

Chrome keeps a separate database per address (the port number and the host name are both part of
it). Open the address you normally use, in the same browser (Chrome, not Safari), in a normal window
(not Private/Incognito).

## "localhost refused to connect" / the page does not open

The server is not running. Start it:

```bash
cd ~/Desktop/smart-family-frame && npm run frame
```

Wait until the terminal shows `Local: http://localhost:4400/`, then reload the browser.
If the terminal shows a red error instead, see the sections below.

## "Port 4400 is already in use" (or 5400)

This usually means **the frame server is already running** (an older terminal window, or the
AUTOSTART LaunchAgent). First simply open http://localhost:4400 in Chrome — if it loads, you are done.

If it does not load and you want a clean start, stop whatever is holding the port. This only stops
programs *listening* on the port (it never touches Chrome or your data):

```bash
lsof -ti tcp:4400 -sTCP:LISTEN | xargs kill
```

Use `5400` instead of `4400` for the development server. The command prints nothing. To confirm the
port is now free, run `lsof -ti tcp:4400 -sTCP:LISTEN` — no output means nothing is using it. Then
start again.

If the port becomes busy again by itself a few seconds later, the AUTOSTART LaunchAgent is restarting
the server — that is normal; just open the address in Chrome. To stop the automatic server:

```bash
launchctl unload ~/Library/LaunchAgents/com.family.frame.server.plist
```

Restarting the Mac also frees every port.

## npm dependencies disappeared ("Cannot find module", "vite: command not found", no node_modules folder)

Reinstall exactly what the lock file says. This never touches your source code or your frame data:

```bash
cd ~/Desktop/smart-family-frame && npm ci
```

If `npm ci` complains about the lock file, use `npm install` instead. Then start again.

## I want a completely fresh install of dependencies (keep my code)

```bash
cd ~/Desktop/smart-family-frame && rm -rf node_modules dist && npm ci && npm run frame
```

`node_modules` (downloaded libraries) and `dist` (the built app) are rebuilt automatically;
`src/`, `public/`, the documents and your browser data are untouched. (If AUTOSTART is set up, the
frame is unavailable while this runs; afterwards restart it with the LaunchAgent restart command
from AUTOSTART.md instead of `npm run frame`.)

## "npm: command not found" / "node: command not found"

Node.js is not installed (or Terminal was opened before installing it). Install Node.js LTS from
https://nodejs.org, close and reopen Terminal, then run the start command again.

## The service worker behaves incorrectly (old version keeps showing, blank page, odd "offline" behaviour)

The daily frame installs a small "service worker" in Chrome so the app also loads when the
server is down. If it ever misbehaves:

1. Make sure the server is running: `cd ~/Desktop/smart-family-frame && npm run frame`
   (or the AUTOSTART LaunchAgent).
2. In Chrome, open http://localhost:4400 and press **Cmd+Shift+R** (hard reload) once.
3. If that is not enough: Chrome menu → **View → Developer → Developer Tools** → **Application** tab →
   **Service Workers** → click **Unregister**, then reload the page. The app re-registers a fresh
   worker automatically. Your data in IndexedDB is not affected by unregistering.
4. Never use "Clear site data" / "Clear storage" unless you have a backup — that deletes photos and settings.

Note: after the software is updated, the page reloads itself once to switch to the new version.
That is expected; press ENTER FRAME MODE again.

## The project stops starting after a change

Run the checks; they print exactly what is wrong:

```bash
cd ~/Desktop/smart-family-frame && npm run typecheck && npm run test && npm run build
```

Fix the reported file, or ask for help with the exact error text. If the code was changed by
mistake and you have no fix, restoring the folder from a Time Machine backup returns the working
version (your frame data lives in Chrome, not in the folder, so it survives).

## I want to keep my calendar, notes, reminders and schedules safe

Settings → **Download backup** (JSON). Keep the file somewhere safe. Photos are NOT inside the backup
in V1 — keep your original photo files too. Settings → **Choose backup file…** restores it.

## Quick reference

| Situation | What to do |
| --- | --- |
| Start the frame (daily) | `cd ~/Desktop/smart-family-frame && npm run frame`, then open http://localhost:4400 |
| Start for development | `cd ~/Desktop/smart-family-frame && npm run dev`, then open http://localhost:5400 |
| Reinstall dependencies | `cd ~/Desktop/smart-family-frame && npm ci` |
| Port already in use | see the section "Port 4400 is already in use" above |
| Check everything | `cd ~/Desktop/smart-family-frame && npm run typecheck && npm run test && npm run build` |
| Stop a running server | press **Ctrl+C** in its terminal window |
