/**
 * Thin wrapper around the official Meta WhatsApp Business Cloud API (never WhatsApp Web automation or
 * unofficial libraries — V2 build §48). Uses Node 22's built-in `fetch`, no extra HTTP dependency.
 */
import { GRAPH_API_BASE, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID } from './config.js';

export interface MetaMediaInfo {
  url: string;
  mimeType: string;
  fileSize: number;
}

/** Resolves a WhatsApp media id to a short-lived, authenticated download URL (never a permanent one — V2 build §92). */
export async function getMetaMediaInfo(mediaId: string): Promise<MetaMediaInfo> {
  const res = await fetch(`${GRAPH_API_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN.value()}` },
  });
  if (!res.ok) throw new Error(`Meta media lookup failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { url: string; mime_type: string; file_size: number };
  return { url: data.url, mimeType: data.mime_type, fileSize: data.file_size };
}

/** Downloads the media bytes. Must happen promptly — Meta media URLs expire within minutes. */
export async function downloadMetaMedia(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN.value()}` } });
  if (!res.ok) throw new Error(`Meta media download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Sends a plain text reply. Kept rare and short by every caller — see V2_COST_NOTES.md. */
export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  const phoneNumberId = WHATSAPP_PHONE_NUMBER_ID.value();
  if (!phoneNumberId) {
    console.warn('[whatsapp] WHATSAPP_PHONE_NUMBER_ID not configured; skipping outbound reply.');
    return;
  }
  const res = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN.value()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: body.slice(0, 4096) } }),
  });
  if (!res.ok) console.error('[whatsapp] send failed', res.status, await res.text().catch(() => ''));
}
