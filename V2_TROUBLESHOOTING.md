# V2 Troubleshooting

## "Remote sharing not configured" on the Frame

This is the expected, safe default — not an error. It means one or more of the six `VITE_FIREBASE_*`
values are missing from the Frame's `.env.local`. Every V1 feature keeps working normally. See
FIREBASE_SETUP.md to configure it.

## Pairing code says "expired" or "already used"

Codes last 10 minutes and work once. Tap **Generate a new code** on the Frame and try again promptly.
If you scanned a QR from an old screenshot or a paused browser tab, it may have already expired.

## The Family app shows "No Frame connected yet" right after I definitely paired it

This can happen if the app was reloaded at exactly the wrong moment mid-pairing, or if you're looking at
a browser tab that was open from *before* the pairing (its listeners are stale). Pull-to-refresh or
reload the page. If it persists, check that you're signed in as the same account that did the pairing —
a second Google account or a fresh anonymous session won't see a family it never joined.

## The Frame shows "Connected" but nothing syncs

1. Check Settings → Remote Sharing → **Pending items**. A non-zero, growing number usually means a
   transient network issue that's actively retrying (see "Cloud retry" in V2_ARCHITECTURE.md §5) —
   give it a minute.
2. Open the browser console (View → Developer → JavaScript Console in Chrome) and look for
   `permission-denied` errors. If you're running against your **own** modified `firestore.rules`, deploy
   the version in this repo (`firebase deploy --only firestore:rules`) — a stale or hand-edited ruleset
   is the most common cause.
3. Confirm the Family PWA and the Frame are pointed at the **same** Firebase project (`VITE_FIREBASE_PROJECT_ID`
   matches in both `.env.local` files).

## WhatsApp setup or delivery problems

WhatsApp is deferred from the supported release. Use the Family app to send photos and manage household
updates; do not spend time troubleshooting Meta configuration for this product version.

## "Property X is undefined" or "evaluation error" in a Firestore permission-denied message

If you're modifying `firestore.rules` yourself: this is a known Firestore *emulator* quirk, not
necessarily a real bug in your rule. See V2_SECURITY.md's "Lessons from live testing" section for the
two specific patterns that cause it (`get(path) != null` as an existence check, and reading a
`resource.data` field that isn't part of a query's own filter during `list` evaluation) and their fixes.
If you hit a NEW instance of this, `npm run test:rules` and the emulator's Requests inspector
(http://localhost:4040/firestore/requests while emulators are running) will show you exactly which rule
line failed.

## `brew install openjdk` / Java errors when starting emulators

The Firestore/Storage emulators are Java-based. After installing, `openjdk` on Apple Silicon Macs is
"keg-only" (not automatically on your PATH) — either run
`export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"` before `npm run firebase:emulators`, or add that
line to your shell profile (`~/.zshrc`) permanently.

## Port already in use when starting emulators

See the port table in FIREBASE_SETUP.md's Part A. If something else on your Mac is already using one of
8080/9099/9199/5001/5050/4040/4041/4042, stop it, or run `lsof -i :PORT` to find what's holding it.

## I want to start completely over locally

Clear browser site data for `localhost:5400` (or 4400) — this wipes the Frame's local IndexedDB
(photos, settings, sync state) — and, if testing against emulators, click **Clear all data** in the
emulator dashboard (http://localhost:4040) to wipe the cloud side too. Never do this against a real
deployed project unless you mean to delete real family data.
