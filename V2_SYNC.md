# Smart Family Frame V2 — Sync Engine Reference

## Conflict handling

V2 deliberately avoids CRDTs or a general merge protocol (V2 build §46 explicitly asks for this). Since
calendar, note and reminder sync is cloud → Frame only (see V2_ARCHITECTURE.md §5), there is no
concurrent-write conflict for those domains: the cloud document is authoritative and is applied as-is
via `contentSync.ts`'s `watchRemoteCollection`. Household is bidirectional because the Frame owns the
full setup/payment UI; locally committed records enter the IndexedDB outbox and are written to that
Frame's cloud subcollections. Two family members
editing the SAME cloud document concurrently (e.g. two people editing one calendar event from two
phones) resolve the way Firestore always resolves concurrent writes to one document: last write wins at
the field level for a `set`, or an `update` failing/merging depending on what each client sent — normal
Firestore semantics, not something V2 layers extra logic on top of.

Household **payment records** are the one place V2 build §46 calls out explicitly ("do NOT silently
overwrite conflicting monetary changes"): `householdPayments` documents are never *updated* — each
payment is its own new document (see `saveHouseholdPayment` in `src/services/dataService.ts`, unchanged
from V1), so there is structurally no way for two concurrent payment entries to overwrite each other.

## Frame-authored content

Frame-authored calendar, note and reminder edits remain local, matching V1. Household services,
settings, daily entries and payments are different: `householdOutbox.ts` queues them only after the
local IndexedDB commit succeeds and retries pending writes after reconnect/startup. The authenticated
`syncFrameHousehold` callable limits every batch to the calling device's own Frame and the four allowed
Household collections; direct Frame writes remain denied by Firestore Rules. Startup also queues the
pre-outbox local Household snapshot once so an existing setup is not stranded on the Frame.

## Pairing logic (`functions/src/pairing.ts`)

`claimPairingCode` branches on whether the target Frame already belongs to a family:

1. **Frame already has a family** (a second+ person pairing to an already-connected Frame — Acceptance
   Test 3) → the claimer joins that family as a `MEMBER` (or is a no-op if already an active member; a
   `REVOKED` member re-claiming a fresh code is reactivated — this requires the owner to have shared a
   new code, so it's an intentional re-invite, not a way to bypass revocation).
2. **Frame is unpaired, claimer already owns a family** (pairing an *additional* Frame — Acceptance
   Test 4, "Living Room" + "Parents") → the Frame is attached to that family.
3. **Frame is unpaired, claimer owns no family** → a new family is created with the claimer as `OWNER`.
4. **Frame is unpaired, claimer belongs to a family only as a `MEMBER`** → rejected
   (`permission-denied`): pairing a new Frame is an OWNER-only action (V2 build §16).

The whole thing runs inside one `db.runTransaction()`, so two people racing to claim the same code can
never both succeed — Firestore transactions serialize conflicting reads/writes on the same documents,
which is what makes "concurrent claim" safety structural rather than something bolted on with locks.

## Photo sync (`src/cloud/photoSync.ts`)

1. The Frame listens to `families/{familyId}/photos` filtered to `frameId == <this Frame>`.
2. On each new/changed doc, `cloudPhotoMap` is checked first — an already-synced `cloudPhotoId` is
   skipped (V2 build §34, no re-download on every startup).
3. Otherwise: download via `getBytes()` (Storage SDK, authenticated — never a public URL), validate
   (`validatePhotoFile` — the SAME validator V1's own photo import uses), decode with the SAME
   `decodeImage()` V1 uses for local imports (dimensions + thumbnail), then `photoRepo.add()` — the
   exact function the Photos page and Slideshow already read from.
4. A `cloudPhotoMap` row is written, and `confirmPhotoSynced` is called (best-effort — if it fails, the
   photo is still kept locally and confirmation is simply retried on the next successful sync round).
5. A failed download is queued in `syncQueue` (`domain: 'photo'`) with an attempt counter and retried
   with capped exponential backoff (5s, 10s, 20s, ... capped at 5 minutes, giving up after 6 attempts) —
   never a tight retry loop (V2 build §36).

## WhatsApp message flow (`functions/src/whatsapp/webhook.ts`)

1. **Signature verification** — every POST's `X-Hub-Signature-256` header is checked (HMAC-SHA256 over
   the raw body with the Meta App Secret, constant-time compared) before anything in the body is parsed.
2. **Idempotency** — each message id is claimed with `db.doc(...).create()`, which fails if the
   document already exists. A Meta retry of the same delivery hits the same id, `create()` throws, and
   the message is silently skipped — this is what makes duplicate webhook delivery produce zero
   duplicate photos/actions (V2 build §91).
3. **Sender resolution** — `whatsappSenders/{waId}` (phone number, no leading `+`) is looked up. An
   unlinked sender gets a generic rejection message that never reveals a Frame id or family name (V2
   build §54) unless their message was itself a `LINK <code>` command, which is handled before the
   sender lookup (that's exactly how a number BECOMES linked).
4. **Command parsing** (`whatsapp/commands.ts`, pure/unit-tested) — `LINK`, `FRAME`/`SEND`, `HELP`,
   the four household quick commands, and `REMIND HH:MM <message>`. Unrecognized text gets the help
   text back, never an AI-interpreted guess (V2 build §56: a deterministic parser, not an LLM, for cost
   and predictability).
5. **Target Frame resolution** — a sender's `defaultFrameId` is used if set; if the family has exactly
   one Frame it's auto-selected and remembered; if more than one, the sender is asked to reply
   `FRAME <name>` first.
6. **Image messages** — media is fetched via the official Meta media API (`GET /{media-id}` for a
   short-lived authenticated URL, then downloaded promptly — V2 build §92, never assuming that URL is
   permanent), validated, uploaded to the SAME Storage path convention as PWA uploads, and turned into a
   `CloudPhoto` record via the SAME `createPhotoRecordInternal` the `createPhotoRecord` callable uses —
   one implementation, not a second one for WhatsApp.
7. A short acknowledgement ("Photo sent to Parents Frame ✅") is sent back — and only that; V2 build §57
   explicitly asks for confirmations only, never marketing/status spam.

Known limitation, documented rather than silently glossed over: the household quick commands
(`MAID PRESENT TODAY`, etc.) and the server side of `REMIND` use the **server's UTC date**, not the
Frame's local date, since the webhook has no reliable way to know a Frame's timezone. For a household in
a very different timezone from UTC, a command sent very late at night could log against the "wrong"
calendar day. The Family app's own Household/Reminders screens use the phone's local date and don't have
this limitation — see V2_TROUBLESHOOTING.md.
