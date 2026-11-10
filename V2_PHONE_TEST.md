# Real Phone Test Procedure — Smart Family Frame V2

A step-by-step script for verifying the supported V2 path end-to-end with a real phone, once
FIREBASE_SETUP.md Part B is done and everything is deployed. Follow in order.

## Setup

1. Start the daily Frame on the Mac: `npm run frame` → open http://localhost:4400 → drag to the Acer,
   or just keep it in a normal window for this test.
2. On your phone, open the Family app's Hosting URL (from FIREBASE_SETUP.md step 11) in Safari/Chrome.
   Optionally **Add to Home Screen** so it behaves like an app.

## Procedure

1. **Sign in.** Tap **Continue with Google** (or use the email-link option). Confirm you land on
   **Connect a Frame**.
2. **Pair the Frame.** On the Mac, go to **Settings → Remote Sharing** on the Frame — note the 6-digit
   code (or scan its QR with your phone's camera app, which should open the Family app straight to the
   pairing screen with the code filled in). Enter it on the phone and tap **Connect**.
   - **Expected**: phone shows "Connected!" and the Frame's Settings shows "Connected" with your name
     under "Connected family members" within a few seconds.
3. **Send a photo.** On the phone, tap **Send Photos**, choose one photo from your camera roll, send it.
   - **Expected**: within a few seconds, the photo appears in the Frame's **Photos** page and starts
     appearing in the slideshow (Frame Mode or Photos mode). No manual refresh needed.
4. **Turn the Frame's internet off.** Disconnect Wi-Fi on the Mac (or pull the cable).
   - **Expected**: the photo you just sent is still there, the slideshow keeps running normally,
     nothing looks broken. Settings → Remote Sharing shows "Offline".
5. **Send a calendar event from the phone** (Wi-Fi still off on the Mac). Family app → Calendar → New
   event → Save.
6. **Reconnect the Frame's internet.**
   - **Expected**: within a few seconds, Settings → Remote Sharing returns to "Connected", and the
     calendar event from step 5 appears on the Frame's Calendar page.
7. **Test a second family member.** On another phone (or the same phone signed in as a different
   Google account), sign in, pair using a **new** code generated from the Frame's Settings ("Pair
   another member"), send a photo.
   - **Expected**: both people's photos are on the Frame, each with the correct sender attribution
     visible in the Family app's Photos view.
8. **Revoke a member.** As the owner, Family app → Settings → Members → Remove the second member.
   - **Expected**: that person's next attempt to send a photo or open family data fails with a clear
     "you no longer have access" style message, not a crash. Their previously-sent photos remain on the
     Frame.

## Pass/fail

All eight steps should behave exactly as described. If any step's actual result differs, see
V2_TROUBLESHOOTING.md before assuming it's broken — most surprises during this test are pairing-code
expiry (10 minutes) or a stale browser tab that needs a manual reload.
