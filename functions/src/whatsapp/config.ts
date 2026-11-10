/**
 * WhatsApp Cloud API configuration. The access token, app secret and webhook verify token are plain
 * Functions params (not Secret Manager) so deploy does not require Cloud Billing — set them in
 * `functions/.env.<project-id>`, never committed, never shipped to the browser. See WHATSAPP_SETUP.md
 * for exactly where to get each value.
 */
import { defineString } from 'firebase-functions/params';

export const WHATSAPP_ACCESS_TOKEN = defineString('WHATSAPP_ACCESS_TOKEN');
export const WHATSAPP_APP_SECRET = defineString('WHATSAPP_APP_SECRET');
export const WHATSAPP_WEBHOOK_VERIFY_TOKEN = defineString('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
export const WHATSAPP_PHONE_NUMBER_ID = defineString('WHATSAPP_PHONE_NUMBER_ID');

export const GRAPH_API_VERSION = 'v21.0';
export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
