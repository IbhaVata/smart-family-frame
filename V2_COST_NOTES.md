# V2 Cost Notes

Specific prices change often and are deliberately not hardcoded here — check the current Firebase
pricing page and Meta's WhatsApp Business Platform pricing page for real numbers. This document explains
what drives cost and how the architecture keeps it low, so you can reason about your own family's
numbers.

## Cost drivers

| Driver | What causes it |
| --- | --- |
| Firestore reads/writes/deletes | Every document read or write, including each item a `list` query returns |
| Firestore realtime listeners | Billed as reads — one per document each time it changes while a listener is open |
| Cloud Functions invocations + compute time | Each callable/webhook call, plus CPU/memory time it runs for |
| Firebase Storage | Bytes stored, plus bytes downloaded (egress) |
| Firebase Hosting | Bytes served for the Family PWA (its own build is a few hundred KB, gzipped) |
| WhatsApp outbound messages | Meta bills "business-initiated" conversations; replies within a 24h customer-service window are typically free |

## How this architecture minimizes each one

- **Download-once, store locally.** A photo is downloaded from Storage by a Frame exactly once
  (`cloudPhotoMap` dedup in `src/cloud/photoSync.ts`) — reopening the Frame, restarting the Mac, or
  losing and regaining internet never re-downloads anything already synced.
- **No polling.** Every sync path (`src/cloud/contentSync.ts`, `photoSync.ts`, `settingsSync.ts`) uses
  Firestore's realtime listeners, which push changes — there is no "check every N seconds" loop anywhere
  in this codebase.
- **Low-frequency heartbeat.** `frameHeartbeat` is called at most once per ~5 minutes client-side, and
  the Cloud Function itself independently throttles to ~once per 4 minutes server-side even if called
  more often — see V2_ARCHITECTURE.md §6.
- **Image optimization before upload.** The Family PWA resizes phone photos to a maximum dimension
  (`PHOTO_MAX_DIMENSION` in `shared/types.ts`, 2560px) before uploading — a 12 MB phone photo typically
  becomes well under 1 MB, cutting both Storage cost and download time/egress for the Frame.
- **WhatsApp replies are rare and short.** Every automated reply (`sendWhatsAppText` in
  `functions/src/whatsapp/metaClient.ts`) is a direct reply to a message the user just sent — a
  confirmation or an error, never unsolicited. There is no marketing, no proactive notification, no use
  of WhatsApp as a status/heartbeat channel (V2 build §58).
- **Idempotent webhook processing.** Meta retries webhook deliveries on any non-2xx or timeout; this
  project's webhook always returns `200` immediately after signature verification and processes
  asynchronously, and every message id is deduplicated (`whatsappProcessedMessages`) — a retry never
  causes duplicate Storage uploads, duplicate Firestore writes, or a duplicate WhatsApp reply.
- **Security rules avoid unnecessary reads.** Where a check can be answered from data already being
  read (e.g. `resource.data.familyId` on the document itself) rather than an extra `get()` call, that's
  what the rules do — see `firestore.rules`.

## Planned but not yet implemented: cloud photo retention

V2 build §37 asks for the *architecture* to support future retention cleanup, not to implement automatic
deletion in V1 of V2 (a destructive default would be the wrong tradeoff before it's been proven safe).
`CloudPhoto.downloadConfirmedAt` (set by `confirmPhotoSynced`) already records exactly when a Frame
confirmed it has its own local copy — a future scheduled Cloud Function could safely delete the Storage
object (never the Firestore metadata, and never anything not yet confirmed downloaded) after a
configurable window (30/60/90 days) once that's wanted. This is deliberately not wired up yet.

## A rough sense of scale

A single family with 1–3 Frames, sending a normal amount of photos (a handful a day) and using the
household/calendar/reminders features, sits comfortably within Firebase's free "Spark" tier for
Firestore/Functions/Hosting for a long time, and Storage/Cloud costs for a few GB of optimized photos
are small. The main things that would meaningfully increase cost are: many family members generating
lots of simultaneous listener traffic, very large photo libraries, or heavy WhatsApp usage once Meta's
free conversation window is exceeded. None of these are likely for a single-family deployment, but if
you're planning to run this for many families, budget real per-family cost testing before scaling up.
