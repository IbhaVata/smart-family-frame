import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/admin.js';
import { requireUid, requireActiveMember } from '../lib/auth.js';
import { generateSixDigitCode } from '../lib/codes.js';
import { WHATSAPP_LINK_CODE_TTL_MS, type WhatsAppLinkCode } from '../shared/types.js';

const MAX_ATTEMPTS = 5;

/** A family member requests a short-lived code to link their WhatsApp number (V2 build §51). They then
 *  send "LINK <code>" to the Smart Frame WhatsApp number; whatsapp/webhook.ts claims it. */
export const createWhatsAppLinkCode = onCall<{ familyId: string }>(async (request) => {
  const uid = requireUid(request);
  const familyId = String(request.data?.familyId ?? '');
  if (!familyId) throw new HttpsError('invalid-argument', 'familyId is required.');
  const member = await requireActiveMember(familyId, uid);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateSixDigitCode();
    const ref = db.doc(`whatsappLinkCodes/${code}`);
    const created = await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists && !(existing.data() as WhatsAppLinkCode).used && (existing.data() as WhatsAppLinkCode).expiresAt > Date.now()) return false;
      const doc: WhatsAppLinkCode = { code, uid, familyId, displayName: member.displayName, createdAt: Date.now(), expiresAt: Date.now() + WHATSAPP_LINK_CODE_TTL_MS, used: false };
      tx.set(ref, doc);
      return true;
    });
    if (created) return { code, expiresAt: Date.now() + WHATSAPP_LINK_CODE_TTL_MS };
  }
  throw new HttpsError('resource-exhausted', 'Could not generate a link code. Try again.');
});
