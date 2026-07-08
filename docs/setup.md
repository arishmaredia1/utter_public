# Utter — Setup

## Prerequisites

- Node 20+
- pnpm 9+ (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- A running MongoDB (local: `brew install mongodb-community && brew services start mongodb-community`)
- A Backblaze B2 bucket
- API keys: Anthropic (web), Groq (desktop, plus optional retranscribe in web)

## Environment files

Copy and edit:

- `web/.env.example` → `web/.env.local`
- `desktop/.env.example` → `desktop/.env`

## B2 bucket setup

1. Sign up at [backblaze.com](https://www.backblaze.com) — no credit card required.
2. Go to **B2 Cloud Storage → Buckets → Create a Bucket**. Name it `utter`, set **Private**.
3. Note the **Endpoint** shown on the bucket page — it looks like `s3.us-west-004.backblazeb2.com`. The region is the middle segment (e.g. `us-west-004`). Set `B2_REGION` to that value.
4. Go to **Application Keys → Add a New Application Key**:
   - Name: `utter`
   - Bucket: select `utter`
   - Capabilities: **Read Files, Write Files, Delete Files, List Buckets, List Files**
   - Click **Create New Key** — copy the **keyID** (`R2_ACCESS_KEY_ID`) and **applicationKey** (`R2_SECRET_ACCESS_KEY`). You won't see the key again.
5. Add CORS rules for the bucket (B2 dashboard → bucket → **CORS Rules** → **Create CORS Rule**):

   ```json
   [
     {
       "corsRuleName": "utter-desktop",
       "allowedOrigins": ["https://tauri.localhost", "tauri://localhost", "http://tauri.localhost"],
       "allowedOperations": ["s3_put", "s3_head"],
       "allowedHeaders": ["*"],
       "exposeHeaders": ["ETag"],
       "maxAgeSeconds": 3600
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
