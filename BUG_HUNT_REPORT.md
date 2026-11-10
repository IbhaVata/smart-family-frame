# Reliability and security review — 10 November 2026

## Fixed

- Initial authentication/setup failures previously left sync idle until reload. Startup now retries
  with bounded backoff and responds to online events even if initialization failed.
- Pairing completion depended on a mounted QR screen. The engine now watches the device's own frame
  document; leaving the screen does not lose the phone's claim.
- Overlapping starts/stops and partial setup failures could leak listeners and retry timers. Session
  ownership now releases each resource as soon as its attempt becomes obsolete.
- Downloaded photos survived phone removal and missed offline deletions. Only complete, authoritative
  server snapshots may prune cloud-mapped copies. Cached empty snapshots cannot erase offline media.
- Photo download/removal races could restore a deleted image. Work is scoped to the active mirror,
  retry timers cancel, and the latest authoritative library controls whether a download may commit.
- A prolonged outage could exhaust photo retries permanently. Attempts are now bounded per active
  session; a fresh authenticated connection can recover an earlier failed download.
- A stalled network download could delay unrelated photo removals. Authoritative removals now use a
  separate local transaction queue and do not wait for network downloads.
- A crash between saving media and saving its cloud mapping could leave an orphan or duplicate.
  Photo metadata, bytes, thumbnail and mapping now commit in one local database transaction.
- The phone deleted storage before checking metadata-delete permission. Metadata authorization now
  happens first, and failures are reported. A failed storage cleanup is distinguished from a successful
  library removal. An offline TV applies that removal on its next authenticated server sync.
- Storage previously let any active member delete another uploader's bytes even though metadata
  deletion was owner/uploader-only. New uploads carry validated, immutable uploader attribution;
  byte deletion now requires the owner or that active uploader. Legacy files without attribution
  require the family owner for storage cleanup; removing their library record still reaches the TV.
- Remote reminder text changes/reconnects reset local trigger memory, allowing duplicate alerts.
  The prior trigger survives if it is still an occurrence of the updated rule.
- Revoked uploaders could delete their old metadata through a stale identity. Active membership is now
  required. Disconnected/re-paired devices lose former-family photo metadata, Storage reads and callable
  downloads. Existing cached content is retained on disconnect, as stated in the UI.
- TV remote handlers are installed during layout commit so a rapid Back press cannot use the previous
  page's handler. The TV creates its stable identity before cloud setup.
- A critical test-tool advisory and all high-severity dependency findings at review time were patched.
  Remaining low/moderate transitive advisories are visible in `npm audit`; CI rejects high/critical ones.

## Validation

Regression tests cover startup recovery, pairing outside the QR screen, obsolete-session cleanup,
remote edit ordering, photo deletion while offline/downloading, authorization ordering, duplicate
snapshots, and reminder deduplication. Permission tests run the real Firestore and Storage rules in
isolated emulators. Android instrumentation exercises the packaged display and both entry-point
profiles. See the GitHub Actions run for the exact results for a particular commit.

## Remaining limits

- Physical-TV behavior and complete phone-to-TV cloud pairing/uploads require device testing.
- Videos, a bounded media cache, full phone schedule/layout controls, release signing and app-store
  distribution are not implemented by this change.
- Storage cleanup can fail after metadata removal; the phone reports that condition. Library removal
  still propagates to the TV, but orphaned cloud bytes need cleanup before claiming complete erasure.
- Disconnect retains cached content. A remote device-wipe feature is separate.
- Security rules, Cloud Functions and the phone's hosted build must be deployed to update an existing
  hosted installation. CI deliberately performs no deployment.
- The source APK uses local public client configuration; CI APK pairing requires the equivalent
  repository Actions variables. No server secrets belong in VITE variables.
