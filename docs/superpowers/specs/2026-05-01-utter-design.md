# Utter — Design Spec

**Date:** 2026-05-01
**Status:** Approved (pending written-spec review)

## What we're building

Utter is a personal meeting recorder. Two apps that share an R2 bucket and a MongoDB database:

1. **`desktop/`** — a Tauri 2 app that records the chosen window (or screen, or tab) plus audio, streams the recording to Cloudflare R2 as it captures, and registers the recording in MongoDB.
2. **`web/`** — a Next.js 15 app where the admin sees their recordings, watches them with synced transcripts, asks Claude questions about a transcript, and creates public share links.

Both apps are gated by a single admin username/password stored in `.env`. There is no multi-user system, no signup, no roles. One person uses Utter.

## Non-goals

- Real-time/live transcription (transcription runs once after upload completes)
- Multi-user, teams, permissions, or invites
- Editing recordings (trim, splice, redact)
- Mobile apps
- Native MP4 (we ship WebM end-to-end; the browser plays it everywhere)

## Architecture

```
┌──────────────────┐    multipart upload      ┌────────────┐
│  desktop (Tauri) │ ───────────────────────► │  R2 bucket │
│  webview         │                          └────────────┘
│  - MediaRecorder │      register + groq           ▲
│  - R2 SDK (js)   │ ───────────────────────┐       │ signed URL
│  - login (.env)  │                        ▼       │
└──────────────────┘                  ┌──────────────────┐
                                      │     MongoDB      │
                                      │  recordings col  │
                                      └──────────────────┘
                                              ▲
                                              │
                                      ┌──────────────────┐
       public share viewer ◄─────────►│   web (Next.js)  │
       admin dashboard     ◄─────────►│   - login        │
                                      │   - dashboard    │
                                      │   - share pages  │
                                      │   - Claude chat  │
                                      └──────────────────┘
```

### Repo layout

```
utter/
  desktop/                Tauri 2 app (Rust shell + React/TS frontend)
    src-tauri/            Rust side (thin: env passthrough, window mgmt, file save)
    src/                  React + Vite + Tailwind frontend
    .env.example
  web/                    Next.js 15 (App Router)
    app/
    lib/
    .env.example
  shared/
    types.ts              Recording, TranscriptSegment, ShareLink shapes
  docs/
    superpowers/
      specs/
      plans/
```

We will use `pnpm` workspaces so `shared` is a real package both apps import.

## Desktop app (`desktop/`)

### Stack

- **Tauri 2** (Rust shell)
- **React 18** + **TypeScript** + **Vite** for the webview UI
- **Tailwind CSS** for styling (frontend-design skill applied)
- **`@aws-sdk/client-s3`** in JS for R2 multipart upload (R2 is S3-compatible)
- **MongoDB Node Driver** invoked from Rust via Tauri command, OR called directly from a small Rust handler — see Secrets section below for why we keep MongoDB on the Rust side

### Recording flow

1. **Login.** App opens a login screen. User submits username + password. Rust compares against `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env` (loaded via `dotenvy` at startup). On success, Rust returns a session token kept in memory (no persistence — re-login per app launch is fine for MVP).

2. **Pick a source.** User clicks **Record**. JS calls `navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "window" /* hint */ }, audio: true })`. The OS shows the native picker (Entire Screen / Window / Tab). The user picks Zoom or Meet or whatever. They can alt-tab freely afterwards — `MediaRecorder` keeps reading from the captured surface.

3. **Pick mic.** JS calls `getUserMedia({ audio: true })` for the microphone. We mix system + mic into one `MediaStream` using a `WebAudio` `AudioContext` + `MediaStreamAudioDestinationNode`. Final stream: 1 video track + 1 mixed audio track.

4. **Audio source UI.** Before recording, a small selector lets the user choose **Mic only / System only / Mic + System** (default: **Mic + System**, since meetings are the primary use case). On macOS, "System only" and "Mic + System" require a virtual audio device (BlackHole/Loopback) because WKWebView's `getDisplayMedia` cannot capture system audio — this is documented in the in-app help and the selector explains the requirement when the user is on macOS.

5. **Start `MediaRecorder`.** Config: `mimeType: "video/webm; codecs=vp9,opus"`, `videoBitsPerSecond: 2_500_000`, `timeslice: 5000` (5-second chunks emitted via `ondataavailable`).

6. **Initiate R2 multipart upload.** Before the first chunk arrives, JS calls a Rust command `start_upload(filename)` which returns the R2 upload ID and key. Or simpler: JS does the whole AWS SDK call directly using R2 creds it received from a Rust `get_secrets()` command at login. We'll do the latter for simplicity.

7. **Stream chunks.** Each `ondataavailable` blob ≥ 5 MiB triggers an `UploadPart`. Smaller blobs accumulate in a buffer until they cross 5 MiB (R2 minimum part size, except for the last part). Each completed part records its `ETag` + `PartNumber` in an in-memory list.

8. **Stop.** User clicks Stop, or `track.onended` fires (e.g. they closed the Zoom window). JS:
   - Stops `MediaRecorder`, flushes the final buffer as the last part (any size).
   - Calls `CompleteMultipartUpload` with the part list.
   - Calls Rust command `register_recording({ key, durationMs, sizeBytes, title })` which writes a row to MongoDB.
   - Calls Rust command `transcribe(recordingId)` which:
     - Streams the WebM down from R2
     - POSTs the WebM to Groq's Whisper endpoint (`whisper-large-v3`) with `response_format: "verbose_json"` — Groq accepts WebM/Opus natively, no transcoding needed
     - Updates the MongoDB row with `transcript.segments`, `transcript.fullText`, and `status: "ready"`

9. **Crash safety.** If the app crashes mid-recording, the multipart upload is abandoned. R2 charges for incomplete multipart uploads after 7 days, so we configure a lifecycle rule on the bucket to abort multiparts after 1 day. We do NOT attempt resume in MVP — a crash means the recording is lost. Document this clearly.

### Tauri Rust commands

```rust
// src-tauri/src/main.rs
#[tauri::command] fn login(username: String, password: String) -> Result<Session, Error>
#[tauri::command] fn get_secrets(session: String) -> Result<Secrets, Error>
  // returns R2 creds, Groq key, Mongo URI — only after login
#[tauri::command] fn register_recording(session: String, payload: RecordingMeta) -> Result<String, Error>
#[tauri::command] fn update_transcript(session: String, id: String, segments: Vec<Segment>) -> Result<(), Error>
#[tauri::command] fn list_recent(session: String) -> Result<Vec<Recording>, Error>
```

MongoDB writes happen Rust-side using the official `mongodb` crate. This keeps the database connection string out of JS memory dumps and makes connection pooling cleaner. JS only sees `Recording` shapes.

### UI surfaces (frontend-design skill applied)

- **Login screen** — centered card on dark canvas, single form
- **Idle state** — large primary "Start recording" button, audio source selector, recent recordings list (last 5)
- **Recording state** — minimized to a compact floating control with elapsed time, level meter, stop button. Optional: shrinks to system tray.
- **Post-recording state** — toast: "Uploaded · transcribing…" → "Ready · open in browser"

### Branding tokens

```
--bg-0:        #0B0D11    /* canvas */
--bg-1:        #0F1115    /* card */
--bg-2:        #1A1D24    /* elevated card */
--bg-3:        #2A2F3A    /* hover */
--border:      #2F3441
--text-0:      #F4F5F7    /* primary */
--text-1:      #A8ADBA    /* secondary */
--text-2:      #6B7280    /* muted */
--accent:      #3B82F6    /* primary blue */
--accent-2:    #2563EB    /* hover blue */
--danger:      #EF4444    /* recording dot, errors */
--ok:          #10B981
font:          Inter (variable), system-ui fallback
radius:        6px (controls), 10px (cards)
```

## Web app (`web/`)

### Stack

- **Next.js 15** App Router, React 18, TypeScript
- **Tailwind CSS** + a small set of shadcn/ui components (Button, Dialog, Input, Toast, Card)
- **`mongodb`** Node driver
- **`@aws-sdk/client-s3`** for generating signed playback URLs
- **`@anthropic-ai/sdk`** for Claude chat (streaming via `messages.stream()`)
- **`iron-session`** or signed JWT cookies for admin sessions
- **`nanoid`** for share tokens

### Routes

| Route | Auth | Purpose |
|---|---|---|
| `/login` | public | admin login form |
| `/` | admin | dashboard list of recordings |
| `/r/[id]` | admin | watch + transcript + Claude chat + share-link button |
| `/share/[token]` | public | watch + transcript only |
| `/api/auth/login` POST | public | sets session cookie |
| `/api/auth/logout` POST | admin | clears cookie |
| `/api/recordings` GET | admin | list |
| `/api/recordings/[id]` GET | admin | one |
| `/api/recordings/[id]/url` GET | admin or share token | signed R2 URL |
| `/api/recordings/[id]/share` POST | admin | mint or revoke share token |
| `/api/recordings/[id]/chat` POST | admin | stream Claude response |
| `/api/share/[token]` GET | public | recording + transcript only (no chat) |

### Admin recording page (`/r/[id]`)

Three-column layout on desktop, stacked on mobile:

1. **Left:** `<video>` element with the signed R2 URL. Custom controls in brand styling. Shows current time prominently.
2. **Center:** transcript list. Each segment is a clickable row showing `[HH:MM:SS]` + text. Clicking a row sets `video.currentTime = segment.start`. The currently-playing segment is highlighted (we update via `timeupdate` event).
3. **Right:** "Ask Claude" panel. Input + streaming response area. Conversation persists in `recordings.chats`.

### Claude chat

System prompt template (high-level shape — final wording lives in `web/lib/claude.ts`):

```
You are an assistant analyzing a meeting recording. The transcript below has
timestamped segments. When you reference something specific, cite it with the
timestamp in the format [HH:MM:SS]. The user can click these to jump to that
moment.

TRANSCRIPT:
[00:00:01] segment text...
[00:00:08] segment text...
...
```

User messages stream from `/api/recordings/[id]/chat` using SSE. The frontend renders `[HH:MM:SS]` matches as `<button>` elements that call `seekTo(seconds)` on the video.

**Claude model:** `claude-opus-4-7` (latest Opus per env). Default `max_tokens: 2000`. Prompt caching enabled on the system prompt + transcript block (transcripts are large and reused across turns) — this is what `claude-api` skill recommends.

### Public share page (`/share/[token]`)

Server-side: look up `recordings` where `shareToken = token`. If absent or revoked, 404. Otherwise render:
- Video (signed R2 URL, regenerated on each page load — TTL ~6h)
- Transcript with clickable timestamps (same component as admin)
- Title, date, duration
- No chat. No login. No edit.

Sharable links are a permanent token until revoked. No expiration. The admin can revoke from `/r/[id]`.

### Auth model

- Login form posts username + password to `/api/auth/login`
- Server uses `crypto.timingSafeEqual` against `ADMIN_USERNAME` / `ADMIN_PASSWORD` from env
- On success: set HTTP-only signed cookie via `iron-session` (cookie name `utter_session`, 30-day rolling expiry)
- Middleware (`middleware.ts`) checks the cookie on `/`, `/r/*`, and `/api/*` (except `/api/auth/login`, `/api/share/*`)
- Public share routes never check auth

## Data model (MongoDB)

Single database `utter`, two collections:

### `recordings`

```ts
{
  _id: ObjectId,
  title: string,                       // default: "Recording — May 1, 10:32 AM"
  createdAt: Date,
  durationMs: number,
  sizeBytes: number,
  status: "uploading" | "transcribing" | "ready" | "failed",
  r2Key: string,                       // e.g. "recordings/2026-05-01/abcd.webm"
  r2Bucket: string,
  mimeType: "video/webm",
  transcript: {
    segments: Array<{ start: number; end: number; text: string }>,  // seconds
    fullText: string,
    language: string,                  // groq returns this
    model: "whisper-large-v3"
  } | null,
  chats: Array<{ role: "user" | "assistant"; content: string; createdAt: Date }>,
  shareToken: string | null,           // nanoid(16); null = not shared / revoked
  failureReason: string | null
}
```

Indexes:
- `{ createdAt: -1 }` — dashboard list
- `{ shareToken: 1 }` (sparse, unique) — public lookup

There is no second collection. Chat history lives inline; transcripts live inline. This is fine because individual recordings won't exceed Mongo's 16 MB document limit at our scale (a 1-hour transcript is ~30 KB; 100 chat turns ~200 KB).

## Secrets / `.env` files

### `desktop/.env`

```
ADMIN_USERNAME=
ADMIN_PASSWORD=
MONGODB_URI=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_URL=                 # optional; if set, used for direct playback URLs
GROQ_API_KEY=
```

Loaded by Rust via `dotenvy::dotenv()` on app start. JS gets only what it needs via `get_secrets()` after login.

### `web/.env`

```
ADMIN_USERNAME=
ADMIN_PASSWORD=
SESSION_SECRET=                # 32-byte random for iron-session
MONGODB_URI=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
ANTHROPIC_API_KEY=
```

Both apps share the same `MONGODB_URI` and `R2_*` so they see the same data and files. The desktop app does not need `ANTHROPIC_API_KEY` (chat happens only in web). The web app does not need `GROQ_API_KEY` (transcription happens only on the desktop after upload).

## R2 bucket setup (manual one-time)

- Create bucket `utter` (or whatever, name in env)
- Create API token with R2 Admin Read & Write
- Add lifecycle rule: abort incomplete multipart uploads after 1 day
- CORS rule (so the desktop app can `PUT` from JS — both Tauri origins listed; macOS uses `tauri://localhost`, Windows uses `http://tauri.localhost`):
  ```json
  [{ "AllowedOrigins": ["tauri://localhost", "http://tauri.localhost"],
     "AllowedMethods": ["GET","PUT","POST","DELETE","HEAD"],
     "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"] }]
  ```
- Public access stays **off**. Web app uses pre-signed URLs.

We document these steps in `docs/setup.md` (created during implementation).

## Error handling

- **Upload failure mid-recording:** retry the part 3× with backoff. If still failing, abort the multipart and surface a toast in the recorder. Local copy is NOT kept — the user is told to retry.
- **Transcription failure:** mark recording `status: "failed"`, store `failureReason`. The web dashboard shows a "Retry transcription" button on failed recordings. The web `/api/recordings/[id]/retranscribe` endpoint re-runs the Groq call.
- **Claude chat failure:** stream errors are caught and rendered inline in the chat panel. The user can resend.
- **Stale signed URLs:** the player refreshes the URL via `/api/recordings/[id]/url` on `error` events.

## Testing strategy

- **Desktop:** Vitest for the upload chunker (`uploader.ts`), the audio mixer (`mixer.ts`), and timestamp parsing. Manual E2E for the actual recording flow (no good way to automate the OS picker).
- **Web:** Vitest for `lib/auth.ts`, `lib/claude.ts` (mock Anthropic), `lib/r2.ts` (mock S3 client). Playwright for login → dashboard → share-link flow against a test MongoDB.
- **Shared types:** typecheck via `tsc --noEmit` in CI.

## Implementation order (this is what writing-plans will expand)

1. Repo scaffolding (pnpm workspaces, shared package, base configs)
2. MongoDB connection + Recording type + indexes
3. Web app: login + session + dashboard list (read-only against seeded data)
4. Web app: signed R2 URL endpoint + recording detail page with video + transcript
5. Web app: share token mint/revoke + public share page
6. Web app: Claude chat (streaming, prompt cache, citation parsing)
7. Web app: frontend-design pass — full visual treatment of all routes
8. Desktop app: Tauri scaffold + login + secret bridge
9. Desktop app: capture + mix + MediaRecorder pipeline
10. Desktop app: R2 multipart streaming uploader
11. Desktop app: post-stop transcription + Mongo registration
12. Desktop app: frontend-design pass — full visual treatment of all surfaces
13. Setup doc + .env.examples + R2 lifecycle/CORS instructions

The frontend-design skill is invoked twice — once per app — with the brand tokens above as input.

## Open questions (none blocking)

- Do we want a system tray icon on the desktop app for "Start recording" without bringing the main window forward? (Default: yes, simple.)
- Should the share page show the title or be fully anonymous? (Default: shows title + date.)
- Title: do we auto-generate from Claude after transcription, or always default to date/time? (Default for MVP: date/time only. Can add Claude-generated titles later.)
