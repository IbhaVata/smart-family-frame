# Starting the frame automatically on the Mac

These are **manual steps for you to do later**; the app does not change any macOS settings itself.
Goal: after the Mac logs in, the frame server starts by itself and Chrome opens the frame on the Acer.

The project folder is `/Users/YOUR_USERNAME/Desktop/smart-family-frame` (that is `~/Desktop/smart-family-frame`).
The daily frame address is **http://localhost:4400**.

## Recommended one-command start

For normal daily use, run:

```bash
cd ~/Desktop/smart-family-frame && npm run frame:acer
```

This builds the production app, starts the preview server as a detached process (so closing Terminal
does not stop the frame), and opens a new window in the normal Chrome profile positioned at
`1920,0`—the usual origin of an Acer arranged to the right of a 1920-pixel-wide primary display.
Reusing the normal profile is essential because the real port-4400 IndexedDB data belongs to it.
The app remembers whether Frame Mode was active, so a Chrome restart returns directly to the frame
content; otherwise press ENTER FRAME MODE once. Use `npm run frame:acer:quick` on later starts when
the current build is already known to be good.

If the Acer has a different position in System Settings → Displays, override the coordinates without
editing the project:

```bash
FRAME_DISPLAY_X=2560 FRAME_DISPLAY_Y=0 npm run frame:acer
```

Runtime PID and logs are stored under `.frame-runtime/` and are ignored by Git. Existing port-4400
servers are detected and left alone; the launcher never resets browser data.

To open Terminal: press **Cmd+Space**, type `Terminal`, press **Return**.

## Step 0 — Build once

```bash
cd ~/Desktop/smart-family-frame && npm run build
```

## Step 1 — Start the server at login (LaunchAgent)

launchd starts programs with a very small PATH, so the file below calls `node` by its full path
instead of `npx`/`npm`. Find your node path first:

```bash
which node
```

It prints something like `/opt/homebrew/bin/node` (Apple Silicon Homebrew) or `/usr/local/bin/node`
(Intel / nodejs.org installer). Use that exact path on the line marked NODE PATH.

Create the file `~/Library/LaunchAgents/com.family.frame.server.plist` with this content
(TextEdit → Format → Make Plain Text, then save with that name in that folder):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.family.frame.server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/node</string>   <!-- NODE PATH: replace with the output of `which node` -->
    <string>/Users/YOUR_USERNAME/Desktop/smart-family-frame/node_modules/vite/bin/vite.js</string>
    <string>preview</string>                  <!-- serves the built app on port 4400 (fixed in vite.config.ts) -->
  </array>
  <key>WorkingDirectory</key><string>/Users/YOUR_USERNAME/Desktop/smart-family-frame</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/family-frame.log</string>
  <key>StandardErrorPath</key><string>/tmp/family-frame.err</string>
</dict>
</plist>
```

Load it (this also starts the server right away):

```bash
launchctl load ~/Library/LaunchAgents/com.family.frame.server.plist
```

Check it works: open **http://localhost:4400** in Chrome. If it does not load, read the error log:

```bash
cat /tmp/family-frame.err
```

(The usual cause is a wrong NODE PATH line.)

Useful commands once the LaunchAgent exists:

| What | Command |
| --- | --- |
| Stop the automatic server | `launchctl unload ~/Library/LaunchAgents/com.family.frame.server.plist` |
| Restart it (after a rebuild) | `launchctl kickstart -k gui/$(id -u)/com.family.frame.server` |
| Remove it completely | unload it, then delete the .plist file |

**Important:** while the LaunchAgent is loaded, the server is *already running*. Do not also run
`npm run frame` (it will say "Port 4400 is already in use"); just open the address in Chrome. To apply
a new build, run `npm run build` and then the restart command above.

## Step 2 — Open Chrome fullscreen at login

### Option A: Chrome "app" window + Login Items (simplest)

1. In Chrome open `http://localhost:4400`, then menu ⋮ → **Cast, save and share → Install page as app**
   (or "Create shortcut… → Open as window").
2. The app appears in `~/Applications/Chrome Apps`. System Settings → **General → Login Items** →
   **+** → add it.
3. After login it opens as its own window. Drag it to the Acer once; Chrome remembers the position.
   Press ENTER FRAME MODE.

Installing as an app also makes Chrome treat the frame's storage as durable (it stops being a
candidate for automatic clean-up when the disk is full).

**Warning:** if you ever *uninstall* that Chrome app, Chrome asks "Also delete data from Chrome
(localhost:4400)". Leave that box **unchecked**, otherwise every photo and setting is erased.

### Option B: Chrome kiosk mode (no browser chrome at all)

Create a script `~/frame.command`:

```bash
#!/bin/bash
sleep 8   # give the server time to start
open -na "Google Chrome" --args --kiosk --app=http://localhost:4400 --window-position=1920,0
```

`--window-position=1920,0` places the window on a display that sits to the right of the main one
(use your arrangement from System Settings → Displays). Make it executable:

```bash
chmod +x ~/frame.command
```

Add `~/frame.command` to Login Items (System Settings → General → Login Items → +). Kiosk mode has
no address bar; still click ENTER FRAME MODE once to start the frame logic (fullscreen needs a
click), or use Option A.

## Step 3 — Keep the Mac awake and quiet

- System Settings → **Lock Screen**: "Turn display off … when inactive" → **Never**; "Require
  password after screen saver" → Never (only if the Mac is in a safe place).
- System Settings → **Battery / Energy** → prevent automatic sleeping when the display is off.
- System Settings → **Notifications → Focus**: enable a Focus so notifications do not pop over the frame.
- Optional: automatic login (System Settings → Users & Groups → Automatic login). Only do this if the
  Mac is not used for anything sensitive, since anyone can then open it.
- Optional: the command `caffeinate -d` in Terminal prevents display sleep while it runs.

## Updating the frame software later

Copy the new project files over the folder (or, if the folder becomes a git checkout, pull them), then:

```bash
cd ~/Desktop/smart-family-frame && npm install && npm run build
```

Then restart the server: if you use the LaunchAgent, run the restart command from Step 1; otherwise
stop the old `npm run frame` with Ctrl+C and start it again.

The next time the frame page loads it fetches the new version and **reloads itself once** (you may
see the management screen for a moment). Press ENTER FRAME MODE again after that reload.
