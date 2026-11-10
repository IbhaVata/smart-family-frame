# Firebase Setup — Smart Family Frame V2

This walks through connecting your Smart Family Frame to a real Firebase project, written for someone
who has never used Firebase before. Do the steps in order. Each one says exactly where to click and
what to copy.

You can also skip straight to **Part A** and try everything against a **local emulator** first — no
Google account or real project needed, completely free, and it's how this project was built and tested.
Part B covers the real, deployed project you'll eventually want.

---

## Part A — Try it locally first (no account needed)

1. Open Terminal and go to the project folder:
   ```bash
   cd ~/Desktop/smart-family-frame
   ```
2. Make sure dependencies are installed everywhere:
   ```bash
   npm install
   npm run functions:install
   npm run family:install
   cd firebase-tests && npm install && cd ..
   ```
3. Firebase's local emulators need Java. Check if you have it:
   ```bash
   java -version
   ```
   If that fails, install it once with Homebrew: `brew install openjdk`, then follow the one line of
   output it prints about linking it (or just add
   `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"` to your shell profile).
4. Copy the example environment files and fill them with the same **dummy** values (these only need to
   be consistent with each other for the emulator — they are never sent anywhere real):
   ```bash
   cp .env.example .env.local
   cp family-app/.env.example family-app/.env.local
   ```
   Edit both `.env.local` files to:
   ```
   VITE_FIREBASE_API_KEY=demo-api-key
   VITE_FIREBASE_AUTH_DOMAIN=demo-smart-family-frame.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=demo-smart-family-frame
   VITE_FIREBASE_STORAGE_BUCKET=demo-smart-family-frame.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
   VITE_FIREBASE_APP_ID=1:000000000000:web:0000000000000000000000
   VITE_FIREBASE_USE_EMULATOR=true
   VITE_FIREBASE_EMULATOR_HOST=localhost
   ```
5. Start the emulators (from the repo root, a separate Terminal tab):
   ```bash
   npm run firebase:emulators
   ```
   Wait for **"All emulators ready!"**. Leave this running. The emulator dashboard is at
   http://localhost:4040.
6. In two more Terminal tabs, start the Frame and the Family app:
   ```bash
   npm run dev              # Frame, dev sandbox:   http://localhost:5400
   npm run family:dev       # Family PWA:           http://localhost:5500
   ```
7. On the Frame (`:5400`) go to **Settings → Remote Sharing → Connect family** and note the 6-digit
   code. On the Family app (`:5500`), sign in (see note below), choose **Pair a Frame**, and enter that
   code.

**Signing in against the emulator**: click "Continue with Google" — the emulator shows its own fake
account picker (no real Google account needed), or use "Email me a sign-in link" and open
http://localhost:4040/auth to see the generated link.

Every local port this project uses, so nothing collides:

| Port | What |
| --- | --- |
| 4400 | Frame — daily/production build (`npm run frame`) |
| 5400 | Frame — dev server (`npm run dev`) |
| 4500 | Family PWA — production preview (`cd family-app && npm run build && npm run preview`) |
| 5500 | Family PWA — dev server (`npm run family:dev`) |
| 8080 | Firestore emulator |
| 9099 | Auth emulator |
| 9199 | Storage emulator |
| 5001 | Functions emulator |
| 5050 | Hosting emulator |
| 4040 | Emulator dashboard UI |
| 4041 | Emulator hub (internal coordination — do not open directly) |
| 4042 | Emulator logging (internal) |

## Part B — A real, deployed Firebase project

### 1. Create the project

1. Go to https://console.firebase.google.com and sign in with your Google account.
2. Click **Add project**. Give it a name (e.g. "Smart Family Frame"). You can decline Google Analytics
   — it isn't needed.
3. Wait for it to finish creating, then you'll land on the project's Overview page.

### 2. Register a Web app

1. On the Overview page, click the **`</>`** (web) icon to add an app.
2. Give it a nickname (e.g. "Frame + Family"). You do **not** need Firebase Hosting checked here.
3. Firebase shows you a `firebaseConfig` object with values like `apiKey`, `authDomain`, `projectId`,
   `storageBucket`, `messagingSenderId`, `appId`. **Copy these six values** — you'll paste them into
   both `.env.local` files (the Frame's, and `family-app/.env.local`) as:
   ```
   VITE_FIREBASE_API_KEY=<apiKey>
   VITE_FIREBASE_AUTH_DOMAIN=<authDomain>
   VITE_FIREBASE_PROJECT_ID=<projectId>
   VITE_FIREBASE_STORAGE_BUCKET=<storageBucket>
   VITE_FIREBASE_MESSAGING_SENDER_ID=<messagingSenderId>
   VITE_FIREBASE_APP_ID=<appId>
   VITE_FIREBASE_USE_EMULATOR=false
   ```
   Both files need the **same** values (the Frame and the Family app talk to the same project).

### 3. Enable Authentication

1. In the left sidebar, click **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Google** (toggle it on, pick a support email, Save).
3. Also enable **Email link (passwordless sign-in)** under the **Email/Password** provider — toggle it
   on, then toggle "Email link" on too.
4. Still on Authentication, go to **Sign-in method → Advanced** and confirm **Anonymous** sign-in
   is enabled too (this is what the Frame itself uses — no human types anything).

### 4. Enable Firestore

1. **Build → Firestore Database → Create database**.
2. Choose a location close to you (cannot be changed later). Start in **production mode** (we deploy
   our own rules next, so this is safe either way).

### 5. Enable Storage

1. **Build → Storage → Get started**.
2. Accept the default bucket and location, production mode.

### 6. Install the Firebase CLI and log in

```bash
npm install -g firebase-tools
firebase login
```
This opens a browser window to sign in with the same Google account.

### 7. Connect this project folder to your Firebase project

```bash
cd ~/Desktop/smart-family-frame
firebase use --add
```
Pick your project from the list, and give it an alias like `default` when asked.

### 8. Deploy security rules and indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

### 9. WhatsApp is not required

The supported release uses the Family PWA for remote sharing. Do not configure WhatsApp secrets or a
Meta phone number; that experimental integration is deferred.

### 10. Deploy Cloud Functions

```bash
npm run functions:build
firebase deploy --only functions
```
The first deploy takes a few minutes. It enables Frame pairing, family membership, remote photos and
remote household/calendar updates.

### 11. Build and deploy the Family PWA

```bash
npm run family:build
firebase deploy --only hosting
```
This prints your Hosting URL, e.g. `https://your-project.web.app`. Put that value into the Frame's
`.env.local` as:
```
VITE_FAMILY_APP_URL=https://your-project.web.app
```
(so the Frame's pairing QR code points somewhere real) and restart the Frame.

### 12. (Recommended) App Check

App Check helps stop unauthorized clients from calling your Functions/Firestore/Storage.
**Build → App Check** → register your Web app → choose **reCAPTCHA v3** (free) → follow its on-screen
site-key steps. This project's code does not yet wire in the App Check SDK — treat this as a documented
follow-up before a public launch, not a blocker for family use.

### 13. You're done

Open your Hosting URL on a phone, sign in, and pair it with the Frame's code from
**Settings → Remote Sharing**. See V2_PHONE_TEST.md for the full walkthrough.

---

## Troubleshooting

See V2_TROUBLESHOOTING.md. The short version: if the Frame's Settings shows "Remote sharing not
configured", one of the six `VITE_FIREBASE_*` values is missing from `.env.local` — that's by design
(cloud optionality), not a bug.
