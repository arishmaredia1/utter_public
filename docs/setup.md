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

See `docs/superpowers/plans/2026-05-01-utter-desktop.md` (next plan).
