/**
 * WhatsApp Cloud API configuration. Secrets (access token, app secret, webhook verify token) are
 * Firebase Functions v2 secrets — set with `firebase functions:secrets:set NAME`, never committed, never
 * shipped to the browser. See WHATSAPP_SETUP.md for exactly where to get each value.
 */
import { defineSecret, defineString } from 'firebase-functions/params';

export const WHATSAPP_ACCESS_TOKEN = defineSecret('WHATSAPP_ACCESS_TOKEN');
export const WHATSAPP_APP_SECRET = defineSecret('WHATSAPP_APP_SECRET');
export const WHATSAPP_WEBHOOK_VERIFY_TOKEN = defineSecret('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
export const WHATSAPP_PHONE_NUMBER_ID = defineString('WHATSAPP_PHONE_NUMBER_ID');

export const GRAPH_API_VERSION = 'v21.0';
export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
