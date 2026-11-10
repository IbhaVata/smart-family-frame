# Smart Family Frame V2 — Overview

V2 adds cloud sync and a Family PWA on top of the unchanged, fully-working V1 Frame (README.md). If you
just want to run the Frame like before, nothing here is required — V1 works exactly as it always did with
zero configuration. WhatsApp photo sharing remains in the repository as an inactive prototype and is not
part of the supported release.

## What V2 adds

- **Family PWA** (`family-app/`) — a mobile-first companion app: sign in, pair a Frame, send photos,
  manage calendar/notes/reminders/household, invite/revoke family members.
- **Cloud sync** (`src/cloud/` in the Frame app) — an optional layer that mirrors cloud content into the
  Frame's existing local IndexedDB stores. The Frame is still local-first: it always renders from
  IndexedDB, cloud or no cloud.
- **WhatsApp prototype** (`functions/src/whatsapp/`) — an experimental Meta Cloud API integration retained
  for future work; it is not configured, supported, or required for the current release.
- **Cloud Functions** (`functions/`) — pairing, membership, photo records, remote settings, the
  WhatsApp webhook, all backed by Firestore + Storage + Auth.

Full details: V2_ARCHITECTURE.md (how it fits together), V2_SYNC.md (the sync engine and pairing logic
in depth), V2_SECURITY.md (the security model and rules), V2_COST_NOTES.md.

## Quick start

**Just the Frame (unchanged from V1):**
```bash
npm run frame          # daily use   → http://localhost:4400
npm run dev             # development → http://localhost:5400
```

**Everything, against local emulators (no Firebase account needed):**
```bash
npm run firebase:emulators   # one terminal — leave running
npm run dev                   # another terminal — Frame dev server
npm run family:dev            # another terminal — Family PWA
```
See FIREBASE_SETUP.md Part A for the one-time setup this needs (env files, Java for the emulators).

**Everything, against a real deployed Firebase project:** FIREBASE_SETUP.md Part B. The supported remote
sharing route is the Family PWA; WhatsApp setup is deferred.

## Testing

```bash
npm test                # V1 + V2 unit tests (Frame app) — 199 tests
npm run functions:test   # WhatsApp command parser tests (Functions)
npm run test:rules       # Firestore + Storage security rules, against real emulators — 48 tests
npm run typecheck        # Frame app
npm run functions:typecheck
npm run family:typecheck
```

## Project layout

```
src/                 Frame app (V1, unchanged) + src/cloud/ (V2 sync engine, new)
shared/               Household calculation engine + V2 domain types — the single source of truth,
                      used by the Frame, functions/, and family-app/ (see V2_ARCHITECTURE.md §2)
functions/            Cloud Functions (pairing, membership, photos, settings; WhatsApp prototype)
family-app/           Family PWA (its own package.json, Vite project)
firebase-tests/       Security rules test suite (runs against real emulators)
firestore.rules
storage.rules
firestore.indexes.json
firebase.json         Emulator ports, hosting config
```

## What's NOT implemented (by design, this phase)

Video calling, a voice assistant, a public social network, advertising, payment processing,
subscriptions, native React Native/Flutter apps, an AI chatbot, facial recognition, surveillance
features. See FUTURE.md for the longer-term roadmap these might fit into later.

## Known limitations (documented, not silently glossed over)

- Frame-authored edits (made directly on the Frame's own screen) are not pushed back to the cloud —
  sync is cloud → Frame only in this phase. See V2_SYNC.md "What's not built yet".
- WhatsApp is deferred from the supported release. Its prototype code and setup notes remain only for
  future work; do not depend on it for photo sharing or reminders.
- `householdEntries` (open to any active member, for quick daily actions) can carry a per-entry `amount`
  for some service types — a narrow, documented exception to "financial detail is owner-only". See
  V2_SECURITY.md "Household privacy".
- App Check (extra bot/abuse protection) is documented as a deploy-time step in FIREBASE_SETUP.md but
  not wired into the client SDK code yet.
- A pre-existing `happy-dom` (test-only dependency) vulnerability was flagged by `npm audit` during this
  work; it's unrelated to V2 and the fix is a breaking major-version bump, so it was left for a separate,
  deliberate upgrade rather than bundled into this change.
