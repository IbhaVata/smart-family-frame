/**
 * Meta WhatsApp Cloud API webhook (V2 build §50-58). One HTTPS Cloud Function handling both the
 * one-time GET verification handshake and every POST delivery of incoming messages.
 *
 * Security: every POST is authenticated via the X-Hub-Signature-256 header (HMAC-SHA256 of the raw
 * body with the Meta App Secret) before anything in the body is trusted — see verifySignature() below.
 *
 * Idempotency: Meta retries webhook deliveries, so the SAME message can arrive more than once. Each
 * message id is claimed with an atomic Firestore `create()` (fails if already claimed) before any
 * side effect happens, so a retried delivery is a safe no-op (V2 build §91).
 */
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { db, storage } from '../lib/admin.js';
import { WHATSAPP_APP_SECRET, WHATSAPP_WEBHOOK_VERIFY_TOKEN } from './config.js';
import { getMetaMediaInfo, downloadMetaMedia, sendWhatsAppText } from './metaClient.js';
import { parseWhatsAppCommand, HELP_TEXT } from './commands.js';
import { createPhotoRecordInternal } from '../photos.js';
import { ALLOWED_PHOTO_MIME_TYPES, MAX_PHOTO_BYTES, type WhatsAppLinkCode, type WhatsAppSender, type CloudFrame, type HouseholdService } from '../shared/types.js';

function verifySignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const provided = signatureHeader.slice('sha256='.length);
  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(provided, 'hex');
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

/** Atomically claims a WhatsApp message id. Returns false if it was already processed (a Meta retry). */
async function claimMessageOnce(messageId: string): Promise<boolean> {
  try {
    await db.doc(`whatsappProcessedMessages/${messageId}`).create({ processedAt: Date.now() });
    return true;
  } catch (e) {
    if ((e as { code?: number }).code === 6) return false; // ALREADY_EXISTS -> a Meta retry
    throw e;
  }
}

async function findSender(waId: string): Promise<WhatsAppSender | null> {
  const snap = await db.doc(`whatsappSenders/${waId}`).get();
  return snap.exists ? (snap.data() as WhatsAppSender) : null;
}

async function familyFrames(familyId: string): Promise<CloudFrame[]> {
  const snap = await db.collection('frames').where('familyId', '==', familyId).get();
  return snap.docs.map((d) => d.data() as CloudFrame);
}

async function resolveTargetFrame(sender: WhatsAppSender): Promise<{ frame: CloudFrame } | { error: string }> {
  if (sender.defaultFrameId) {
    const snap = await db.doc(`frames/${sender.defaultFrameId}`).get();
    const frame = snap.data() as CloudFrame | undefined;
    // A default Frame that has since moved to another family must not keep receiving this sender's writes.
    if (frame && frame.familyId === sender.familyId) return { frame };
  }
  const frames = await familyFrames(sender.familyId);
  if (frames.length === 0) return { error: 'Your family has no Frame connected yet.' };
  if (frames.length === 1) {
    await db.doc(`whatsappSenders/${sender.waId}`).update({ defaultFrameId: frames[0]!.frameId, updatedAt: Date.now() });
    return { frame: frames[0]! };
  }
  return { error: `You have ${frames.length} Frames: ${frames.map((f) => f.name).join(', ')}. Reply "FRAME <name>" to choose one.` };
}

async function handleLink(waId: string, senderProfileName: string, code: string): Promise<string> {
  if (!/^\d{6}$/.test(code)) return 'That does not look like a 6-digit code. Check the Frame and try again.';
  return db.runTransaction(async (tx) => {
    const codeRef = db.doc(`whatsappLinkCodes/${code}`);
    const codeSnap = await tx.get(codeRef);
    if (!codeSnap.exists) return 'That code was not found. Ask for a new one in the Family app.';
    const data = codeSnap.data() as WhatsAppLinkCode;
    const memberSnap = await tx.get(db.doc(`families/${data.familyId}/members/${data.uid}`));
    if ((memberSnap.data() as { status?: string } | undefined)?.status !== 'ACTIVE') {
      return 'That code is no longer valid. Ask for a new one in the Family app.';
    }
    if (data.used) return 'That code has already been used. Ask for a new one in the Family app.';
    if (data.expiresAt <= Date.now()) return 'That code has expired. Ask for a new one in the Family app.';
    const sender: WhatsAppSender = { waId, uid: data.uid, familyId: data.familyId, displayName: data.displayName || senderProfileName || 'Family member', defaultFrameId: null, linkedAt: Date.now(), updatedAt: Date.now() };
    tx.set(db.doc(`whatsappSenders/${waId}`), sender);
    tx.update(codeRef, { used: true });
    return `Connected! You're linked as ${sender.displayName}. Send a photo any time to share it.`;
  });
}

async function handleFrameSelect(sender: WhatsAppSender, name: string): Promise<string> {
  const frames = await familyFrames(sender.familyId);
  const match = frames.find((f) => f.name.toLowerCase() === name.toLowerCase()) ?? frames.find((f) => f.name.toLowerCase().includes(name.toLowerCase()));
  if (!match) return `No Frame matching "${name}". Your Frames: ${frames.map((f) => f.name).join(', ') || 'none yet'}.`;
  await db.doc(`whatsappSenders/${sender.waId}`).update({ defaultFrameId: match.frameId, updatedAt: Date.now() });
  return `From now on, your photos and commands go to "${match.name}".`;
}

async function upsertHouseholdEntry(frameId: string, type: 'MAID' | 'MILK', field: 'attendance' | 'delivery', value: string): Promise<string> {
  const servicesSnap = await db.collection(`frames/${frameId}/householdServices`).where('type', '==', type).where('status', '==', 'ACTIVE').limit(1).get();
  if (servicesSnap.empty) return `No active ${type === 'MAID' ? 'maid/staff' : 'milk'} service is set up on this Frame yet. Add one in the Family app or on the Frame.`;
  const service = servicesSnap.docs[0]!.data() as HouseholdService;
  const today = new Date().toISOString().slice(0, 10); // server UTC date — see V2_TROUBLESHOOTING.md for the local-time nuance
  const entryId = `${service.id}:${today}`;
  await db.doc(`frames/${frameId}/householdEntries/${entryId}`).set({ id: entryId, serviceId: service.id, date: today, [field]: value, note: '', updatedAt: Date.now() }, { merge: true });
  return `Recorded: ${service.name} — ${value.replace('_', ' ').toLowerCase()} today.`;
}

async function createReminder(frameId: string, time: string, message: string, createdByName: string): Promise<string> {
  const today = new Date();
  const dateKey = today.toISOString().slice(0, 10);
  const ref = db.collection(`frames/${frameId}/reminders`).doc();
  await ref.set({ title: message.slice(0, 80), message, date: dateKey, time, repeat: 'NONE', enabled: true, createdAt: Date.now(), updatedAt: Date.now(), createdByName });
  return `Reminder set for ${time} today: "${message}".`;
}

async function handleImageMessage(sender: WhatsAppSender, mediaId: string): Promise<string> {
  const resolved = await resolveTargetFrame(sender);
  if ('error' in resolved) return resolved.error;
  const frame = resolved.frame;
  const info = await getMetaMediaInfo(mediaId);
  if (!(ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(info.mimeType) || info.fileSize > MAX_PHOTO_BYTES) {
    return 'That image type or size is not supported. Use a JPG, PNG or WEBP under 15 MB.';
  }
  const bytes = await downloadMetaMedia(info.url);
  const ext = info.mimeType === 'image/png' ? 'png' : info.mimeType === 'image/webp' ? 'webp' : 'jpg';
  const storageFileId = randomUUID();
  const storagePath = `families/${sender.familyId}/photos/${frame.frameId}/${storageFileId}.${ext}`;
  const file = storage.bucket().file(storagePath);
  // uploadedBy metadata lets storage.rules authorize the uploader's own later delete.
  await file.save(bytes, { contentType: info.mimeType, metadata: { cacheControl: 'private, max-age=0', metadata: { uploadedBy: sender.uid } } });
  try {
    await createPhotoRecordInternal({
      familyId: sender.familyId, frameId: frame.frameId, albumId: null, storagePath,
      filename: `whatsapp-${storageFileId}.${ext}`, mimeType: info.mimeType, size: bytes.byteLength,
      uploadedBy: sender.uid, uploadedByName: sender.displayName, source: 'whatsapp',
    });
  } catch (e) {
    await file.delete({ ignoreNotFound: true }); // don't orphan bytes when the record is refused
    throw e;
  }
  return `Photo sent to ${frame.name} ✅`;
}

async function handleTextMessage(waId: string, senderProfileName: string, text: string): Promise<string> {
  const command = parseWhatsAppCommand(text);
  if (command.type === 'LINK') return handleLink(waId, senderProfileName, command.code);

  const sender = await findSender(waId);
  if (!sender) return 'This number is not linked to a Smart Family Frame. Reply "LINK 123456" using the code shown on the Frame.';

  switch (command.type) {
    case 'HELP':
      return HELP_TEXT;
    case 'FRAME':
      return handleFrameSelect(sender, command.name);
    case 'MAID_PRESENT_TODAY':
    case 'MAID_LEAVE_TODAY':
    case 'MILK_DELIVERED':
    case 'MILK_SKIPPED':
    case 'REMIND': {
      const resolved = await resolveTargetFrame(sender);
      if ('error' in resolved) return resolved.error;
      const frameId = resolved.frame.frameId;
      if (command.type === 'REMIND') return createReminder(frameId, command.time, command.message, sender.displayName);
      const [type, field, value] = HOUSEHOLD_COMMANDS[command.type];
      return upsertHouseholdEntry(frameId, type, field, value);
    }
    case 'UNKNOWN':
    default:
      return `Sorry, I didn't understand that.\n\n${HELP_TEXT}`;
  }
}

const HOUSEHOLD_COMMANDS = {
  MAID_PRESENT_TODAY: ['MAID', 'attendance', 'PRESENT'],
  MAID_LEAVE_TODAY: ['MAID', 'attendance', 'LEAVE'],
  MILK_DELIVERED: ['MILK', 'delivery', 'DELIVERED'],
  MILK_SKIPPED: ['MILK', 'delivery', 'NOT_DELIVERED'],
} as const;

export const whatsappWebhook = onRequest(
  { cors: false },
  async (request, response) => {
    if (request.method === 'GET') {
      const mode = request.query['hub.mode'];
      const token = request.query['hub.verify_token'];
      const challenge = request.query['hub.challenge'];
      if (mode === 'subscribe' && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN.value()) {
        response.status(200).send(String(challenge ?? ''));
      } else {
        response.status(403).send('Forbidden');
      }
      return;
    }

    if (request.method !== 'POST') {
      response.status(405).send('Method not allowed');
      return;
    }

    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    if (!verifySignature(rawBody, signature, WHATSAPP_APP_SECRET.value())) {
      logger.warn('[whatsapp] rejected webhook with invalid signature');
      response.status(401).send('Invalid signature');
      return;
    }

    // Always 200 quickly once authenticated: Meta retries on non-2xx, and we handle idempotency
    // ourselves — a slow downstream failure should not turn into a retry storm.
    response.status(200).send('OK');

    try {
      const body = request.body as { entry?: Array<{ changes?: Array<{ value?: { messages?: Array<Record<string, unknown>>; contacts?: Array<{ profile?: { name?: string }; wa_id?: string }> } }> }> };
      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const value = change.value;
          const messages = value?.messages ?? [];
          const profileName = value?.contacts?.[0]?.profile?.name ?? '';
          for (const message of messages) {
            const messageId = String(message.id ?? '');
            if (!messageId || !(await claimMessageOnce(messageId))) continue;
            const from = String(message.from ?? '');
            if (!from) continue;
            let reply: string | null = null;
            try {
              if (message.type === 'text') {
                const textBody = (message.text as { body?: string } | undefined)?.body ?? '';
                reply = await handleTextMessage(from, profileName, textBody);
              } else if (message.type === 'image') {
                const mediaId = (message.image as { id?: string } | undefined)?.id;
                const sender = await findSender(from);
                if (!sender) {
                  reply = 'This number is not linked to a Smart Family Frame. Reply "LINK 123456" using the code shown on the Frame.';
                } else if (mediaId) {
                  reply = await handleImageMessage(sender, mediaId);
                }
              }
              // Other message types (audio/video/documents/location/etc.) are intentionally ignored in
              // V1 of V2 — see FUTURE.md for video/voice notes as a later phase.
            } catch (e) {
              logger.error('[whatsapp] message handling failed', e);
              reply = 'Something went wrong handling that. Please try again.';
            }
            if (reply) await sendWhatsAppText(from, reply);
          }
        }
      }
    } catch (e) {
      logger.error('[whatsapp] webhook processing failed', e);
    }
  },
);
