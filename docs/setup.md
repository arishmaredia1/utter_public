# Utter — Setup

## Prerequisites

- Node 20+
- pnpm 9+ (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- A running MongoDB (local: `brew install mongodb-community && brew services start mongodb-community`)
- A Cloudflare R2 bucket
- API keys: Anthropic (web), Groq (desktop, plus optional retranscribe in web)

## Environment files

Copy and edit:

- `web/.env.example` → `web/.env.local`
- `desktop/.env.example` → `desktop/.env`

## R2 bucket setup

1. Create a bucket in the Cloudflare dashboard (e.g. `utter`).
2. Create an API token: **R2 → Manage R2 API Tokens → Create**, scope to your bucket with **Read & Write**. Save the access key + secret.
3. Add the bucket id, access key id, secret access key, and the account id to both `.env` files.
4. Add the lifecycle rule (R2 dashboard → bucket → Lifecycle): "Abort incomplete multipart uploads after 1 day".
5. Add CORS rules:

   ```json
   [
     {
       "AllowedOrigins": ["tauri://localhost", "http://tauri.localhost"],
       "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"]
     }
   ]
   ```

## Generate a session secret

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

## Run the web app

```bash
pnpm install
pnpm --filter @utter/web seed   # optional: seed local Mongo with example recordings
pnpm --filter @utter/web dev
```

Visit http://localhost:3000.

## Run the desktop app

1. Copy `desktop/.env.example` → `desktop/.env` and fill in the values. The same `ADMIN_USERNAME` / `ADMIN_PASSWORD` and the same `MONGODB_URI` + `R2_*` you set for the web app.
2. Add a `GROQ_API_KEY` (https://console.groq.com).
3. Install Rust if you don't have it: https://rustup.rs (Tauri requires it).
4. macOS only: install BlackHole if you want to record system audio. https://github.com/ExistentialAudio/BlackHole — set it as your output device, then choose **Mic + System** or **System only** in the recorder.
5. Start the app:

   ```bash
   pnpm install
   pnpm --filter @utter/desktop tauri dev
   ```

6. Sign in with the admin credentials. Press the red button or hit `⌘⇧R` (Cmd+Shift+R) anywhere.
7. Pick a window in the OS picker. Recordings appear in the web app under `/`.

### Build a distributable

```bash
pnpm --filter @utter/desktop tauri build
```

Outputs to `desktop/src-tauri/target/release/bundle/`.
