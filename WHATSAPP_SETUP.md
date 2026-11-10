# WhatsApp Setup — Smart Family Frame V2

> **Status: deferred prototype.** WhatsApp is not part of the supported Smart Family Frame release.
> Use the Family PWA for remote photo sharing and household updates. This guide and its code are retained
> only for future experimental work; do not spend time configuring Meta for the current release.

This connects your Smart Frame to WhatsApp using Meta's **official** WhatsApp Business Platform (Cloud
API) — never a personal WhatsApp number, never an unofficial/scraping library. Written for someone who
has never used Meta's developer tools before. Do FIREBASE_SETUP.md's Part B first — you need a deployed
`whatsappWebhook` Cloud Function URL before starting here.

## 1. Create a Meta Developer account and app

1. Go to https://developers.facebook.com and click **Get Started** (sign in with a Facebook account, or
   create one — this can be separate from your family's Frame account).
2. Once in the dashboard, click **My Apps → Create App**.
3. Choose the **"Other"** use case, then app type **"Business"**.
4. Give it a name (e.g. "Smart Family Frame") and create it.

## 2. Add the WhatsApp product

1. On your new app's dashboard, find **WhatsApp** in the product list and click **Set up**.
2. Meta creates a **test WhatsApp Business Account** for you automatically, with a **free test phone
   number** you can send messages from immediately — no need to buy anything yet.

## 3. Find your Phone Number ID

1. Still on the WhatsApp product page (**WhatsApp → API Setup**), look for **"Phone number ID"** — a
   long number, not the phone number itself.
2. Put it in `functions/.env`:
   ```
   WHATSAPP_PHONE_NUMBER_ID=<the number you copied>
   ```

## 4. Get a temporary access token, then a permanent one

1. On the same **API Setup** page, there's a **temporary access token** (valid 24 hours) — good enough
   to test with right now.
2. For a token that doesn't expire: **App settings → Basic**, note your **App ID** and **App Secret**
   (needed in step 6), then follow Meta's **System User** flow (**Business Settings → Users → System
   Users → Add** → assign it the WhatsApp app with `whatsapp_business_messaging` permission → **Generate
   token**, no expiration). Copy that token.
3. Store it as a secret (never in a file in this repo):
   ```bash
   firebase functions:secrets:set WHATSAPP_ACCESS_TOKEN
   ```
   Paste the token when prompted.

## 5. Set the webhook

1. Decide on a **verify token** — any random string you make up (e.g. a long password). Store it:
   ```bash
   firebase functions:secrets:set WHATSAPP_WEBHOOK_VERIFY_TOKEN
   ```
2. Get your deployed webhook URL — it's printed after `firebase deploy --only functions`, or find it at
   **Firebase Console → Functions → whatsappWebhook → Trigger URL**. It looks like
   `https://us-central1-<your-project>.cloudfunctions.net/whatsappWebhook`.
3. Back in Meta: **WhatsApp → Configuration → Webhook → Edit**.
   - **Callback URL**: paste your function's URL.
   - **Verify token**: paste the SAME string you just stored as `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
   - Click **Verify and save**. If it fails, redeploy functions first (`npm run functions:build &&
     firebase deploy --only functions`) so the webhook is live, then retry.
4. Under **Webhook fields**, click **Manage** and subscribe to **messages**.

## 6. Get your App Secret

1. **App settings → Basic → App Secret → Show**.
2. Store it:
   ```bash
   firebase functions:secrets:set WHATSAPP_APP_SECRET
   ```
   This is what the webhook uses to verify every incoming message really came from Meta (see
   V2_SECURITY.md).
3. Redeploy functions once more so they pick up all three secrets:
   ```bash
   firebase deploy --only functions
   ```

## 7. Send your first test message

1. On the **API Setup** page, under **Send and receive messages**, there's a **"To"** field pre-filled
   with a test recipient — add your own phone number there (**Manage phone number list**), then Meta
   sends you a WhatsApp message with a code to confirm it's really your number.
2. Once confirmed, from your own WhatsApp, message the test business number.
3. Check **Firebase Console → Functions → whatsappWebhook → Logs** — you should see it received the
   message.

## 8. Link your number to your family

1. On the Family PWA (**Settings → Link WhatsApp**), tap **Get a link code**. It shows a 6-digit code.
2. From your phone's WhatsApp, message the Smart Frame's number: `LINK 123456` (using that code).
3. You should get a reply confirming you're linked. Reply `HELP` any time for the full command list.

## 9. Send a test photo

From WhatsApp, send a photo to the Smart Frame's number. Within a few seconds it should appear on your
Frame (and in the Family app's Photos screen). See V2_PHONE_TEST.md's WhatsApp section for the full
step-by-step with expected results.

## 10. Moving from the test number to your real business number

The free test number works indefinitely for development but has sending limits and shows "via [App
name]" in WhatsApp. To use your own business phone number:

1. **WhatsApp → API Setup → Add phone number**, follow Meta's verification (you'll need a number that
   is **not already registered to a personal WhatsApp/WhatsApp Business app** — port it out first if it
   is).
2. Once verified, update `WHATSAPP_PHONE_NUMBER_ID` in `functions/.env` to the new number's id, and
   redeploy functions.
3. For higher message volume you may need **Business verification** (Meta reviews your business) — this
   is entirely on Meta's side; this repo's code doesn't need to change for it.

## Command reference

| Command | What it does |
| --- | --- |
| `LINK 123456` | Links your WhatsApp number using a code from the Family app |
| `FRAME <name>` or `SEND <name>` | Chooses which Frame your photos/commands go to (if you have more than one) |
| *(send a photo)* | Adds it to your linked/selected Frame |
| `HELP` | Shows this list |
| `MAID PRESENT TODAY` / `MAID LEAVE TODAY` | Quick household attendance |
| `MILK DELIVERED` / `MILK SKIPPED` | Quick delivery log |
| `REMIND 18:30 Take the medicine` | Sets a one-time reminder on the Frame for today at that time |

## Cost note

See V2_COST_NOTES.md. In short: replying to a message a family member sent you (a "service
conversation") is free within Meta's messaging window; this project never sends anything WhatsApp would
bill as a proactive "template" message.
