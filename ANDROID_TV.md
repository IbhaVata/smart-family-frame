# Smart Family Frame for Android TV — 0.1.1

One Android package provides two entry points using the existing React frame renderer:

- **App:** open Smart Family Frame from the TV launcher. Start the frame, pair a phone, choose
  the default layout, change slideshow duration/shuffle, preview layouts, or open screensaver settings.
- **Screensaver:** select Smart Family Frame in the TV's Screen saver/Ambient mode settings where
  third-party selection is available. Android controls when it starts and stops. The first remote
  interaction exits. An unconfigured frame shows instructions to open the app, without management UI.

Photos, clock, calendar, notes, dashboard, night display, and the existing scheduler are reused.
The app and screensaver share one HTTPS origin, WebView profile, IndexedDB database, device identity,
and Firebase pairing. A single-renderer owner prevents overlapping sync sessions during takeover.
Old lifecycle callbacks cannot dispose the new host's renderer. This does not transfer the Mac
browser's database: pair the TV as another frame and send content through the existing Family app.

## Build

Requirements: Node/npm with the repository dependencies installed, JDK 17+, Android SDK platform 36,
and SDK build tools. The checked-in Gradle wrapper downloads its pinned distribution and checks its
SHA-256 checksum. On macOS, the build helper detects standard Android SDK and Homebrew JDK locations.
Set JAVA_HOME and ANDROID_HOME explicitly on other systems or nonstandard installations.

From the repository root:

```sh
npm run tv:build
```

This runs the web production build, bundles it inside the APK, builds the debug APK, and runs Android
lint. Gradle always refreshes web assets so Firebase configuration changes cannot leave stale content.
Result: `android/app/build/outputs/apk/debug/app-debug.apk`.

The existing `.env.local` public Firebase client configuration and `VITE_FAMILY_APP_URL` are used.
Never put server credentials in VITE variables. With no Firebase configuration, local display still
works, but phone pairing is unavailable. Production cloud sync requires internet; downloaded content
plays offline. The package disables HTTP cleartext traffic; local HTTP Firebase emulators are not
supported by this production-network configuration.

## Install and use

Transfer the debug APK to an Android TV (Android 8.0 or later) using your usual APK installation method,
or use an already connected development device:

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.smartfamilyframe.tv/.MainActivity
```

1. Open **Connect phone** and generate the pairing code/QR. Use the existing Family phone web app.
2. Send photos, calendar events, notes, and reminders to this TV using that app.
3. Choose **Start frame** once to complete setup. **Display settings** offers sample content for an
   offline preview on an empty frame; adding samples also adds example events/reminders and schedules.
4. Choose **Use as screensaver**, then select Smart Family Frame in the system selector. Installing
   the app does not automatically change the system's selected screensaver. Some Google TV versions
   restrict this selector; normal app mode remains available.

Remote controls: arrows/OK navigate menus; Left/Right changes photos during display; OK pauses/resumes
the photo slideshow; Back returns to the home menu, then exits. A reminder owns OK while it is shown.
Screensaver mode has no management controls or blocking reminder dialog. It follows the same schedule
and default layout, with subtle movement to reduce fixed elements. Movement does not guarantee against
screen burn-in. Night display is black/dim content, not physical power or backlight control.

Android can stop the app while it is not visible. Sync runs while the app/screensaver is running and
reconnects at the next launch; this is not an always-running background upload receiver. The system's
energy-saving settings still apply. No boot-start, forced wake, root, or accessibility permissions
are used. Active animated photo playback started by the user can request screen-on; the flag clears
when paused, when leaving display, or when the activity loses visibility. Screensaver power is owned
by Android.

## Tests

```sh
npm run typecheck
npm test
npm run tv:build
# With a connected disposable emulator/test device:
npm run tv:build -- :app:connectedDebugAndroidTest
```

Web tests cover mode selection, remote focus, app Back navigation, screensaver setup/error states,
and absence of screensaver management/reminder controls. Android instrumentation tests load the actual
packaged app, exercise D-pad navigation, verify shared IndexedDB settings/identity across renderer
takeover, protect against late host cleanup, and check the native document allowlist.

## Scope and remaining work

- **Images only:** existing JPEG/PNG/WebP pipeline is reused. Video upload, conversion, caching and
  playback are not implemented in this first Android build.
- Phone management currently includes the existing photo/calendar/notes/reminders features and
  duration/shuffle settings. Full schedule/layout/privacy controls on the phone remain additional work.
- Phone photo removal deletes the downloaded TV copy, including after an offline TV reconnects.
  Only a complete server snapshot authorizes pruning; local-only photos are preserved. Legacy synced
  photos are reconciled against the currently paired TV library. Disconnect still retains cached
  content; it is not a remote device-wipe operation.
- Cache limits, media backup/migration, extended offline/reconnect soak tests, physical-TV testing,
  release signing, and Play Store publication remain future release work.
- This APK is a debug/test build, not a Play Store release. The TV banner is a prototype asset.

No existing Mac/phone data, backend rules, deployed services, or prior uncommitted work were replaced.

## Verification — 10 November 2026

- Frame type checks passed; 210 web tests plus 7 additional daylight-saving checks passed.
- Debug APK build and Android lint passed (no lint errors; dependency/SDK recommendations remain).
- Three instrumentation tests passed on the Android TV Android 16 / API 36 ARM64 emulator,
  including shared settings/identity across renderer takeover and remote navigation.
- With emulator networking disabled, the packaged menus and sample photo/dashboard display worked.
- Android's actual Dream Manager automatically started `FrameDreamService` after the emulator became
  idle; a remote OK press exited it. This was tested independently of the renderer takeover tests.
- Home, dashboard, and actual system screensaver screenshots were visually inspected.
- Physical-TV compatibility, complete phone-to-TV cloud pairing/upload, multi-day operation,
  release signing, and store distribution are not verified by these checks.

## Reliability fixes in 0.1.1

- Startup failures retry with bounded backoff, and returning online retries immediately.
- The device record is watched independently of the QR screen, so leaving that screen does not
  interrupt a phone's pairing claim. Initial code creation starts this persistent watch.
- Sync retries and partially-created listeners are cancelled on stop/restart.
- Phone removal waits for server authorization before deleting media bytes. The TV removes cached
  copies on an authoritative server snapshot, including missed deletions during offline operation.
- In-flight downloads cannot restore deleted photos. Photo bytes and their dedup mapping commit
  atomically. Local imports and explicitly-scoped photos from other families are preserved.
- Remote reminder edits preserve local trigger memory for an already-shown occurrence.
- Former device/family associations and revoked uploaders lose server access in the updated rules
  and the photo download callable. These changes require deployment to affect an existing server.

CI runs web/phone/backend checks, Firebase permission tests, Android TV emulator tests, dependency
audits at high severity, and a credential scan. GitHub builds use public Firebase client configuration
from repository Actions variables. Without those variables the APK works locally but cannot pair.
Deployment is separate from CI: no workflow deploys Firebase or publishes to an app store.
