# Utter — Desktop Recorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Tauri 2 desktop app that records a chosen window + audio via the WKWebView/WebView2 `MediaRecorder` pipeline, streams the WebM to Cloudflare R2 as it captures (S3 multipart upload), then on stop registers the recording in MongoDB and posts the file to Groq for transcription. Cross-platform: macOS + Windows.

**Architecture:** Tauri 2 with a thin Rust shell (env loader, MongoDB writes, OS shell — no capture logic in Rust). React 19 + TypeScript + Tailwind frontend in the webview. `getDisplayMedia` + `getUserMedia` mixed via Web Audio. `MediaRecorder` with `timeslice: 5000` emits 5-second WebM chunks; an in-JS uploader buffers ≥ 5 MiB before each `UploadPart` to R2 (S3-compatible) using `@aws-sdk/client-s3`. On stop: `CompleteMultipartUpload`, then a Rust command writes the `Recording` row to Mongo, then a Rust command POSTs the WebM (re-fetched from R2) to Groq for transcription and updates Mongo.

**Tech Stack:** Tauri 2, Rust 1.78+, dotenvy, mongodb (rust crate), reqwest (multipart for Groq), tokio. Frontend: React 19, TypeScript 5, Vite, Tailwind 3, zustand, @aws-sdk/client-s3.

**Prerequisites:** Plan A (`2026-05-01-utter-web-and-shared.md`) is complete or at least Tasks 1, 2, 5 (monorepo, shared types, MongoDB lib) are done — the desktop app shares the schema and the Mongo URI.

**Phases (checkpoint between):**
1. Tasks 1–4: Tauri scaffold, brand tokens, Rust env loader, build verifies
2. Tasks 5–7: Login + secret bridge + recent-recordings query
3. Tasks 8–11: Capture pipeline (getDisplayMedia + mixer + MediaRecorder)
4. Tasks 12–14: R2 multipart streaming uploader + retries
5. Tasks 15–17: Stop sequence — Mongo registration + Groq transcription
6. Tasks 18–22: UI (idle, recording pill, recents, tray, hotkey)
7. Tasks 23–24: Setup docs + smoke test

---

## Task 1: Tauri 2 scaffold inside the monorepo

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/vite.config.ts`
- Create: `desktop/tsconfig.json`
- Create: `desktop/tsconfig.node.json`
- Create: `desktop/index.html`
- Create: `desktop/src/main.tsx`
- Create: `desktop/src/App.tsx`
- Create: `desktop/src/index.css`
- Create: `desktop/postcss.config.js`
- Create: `desktop/tailwind.config.ts`
- Create: `desktop/src-tauri/Cargo.toml`
- Create: `desktop/src-tauri/tauri.conf.json`
- Create: `desktop/src-tauri/build.rs`
- Create: `desktop/src-tauri/src/main.rs`
- Create: `desktop/src-tauri/icons/` (placeholder PNGs)
- Modify: `pnpm-workspace.yaml` (already includes `desktop` from Plan A Task 1)

- [ ] **Step 1.1: Verify Rust toolchain**

```bash
rustc --version
cargo --version
```
Expected: Rust 1.78+ and Cargo. If missing: install via `rustup`. Also install Tauri CLI globally once: `cargo install tauri-cli --version "^2.0.0" --locked` (or use `pnpm exec tauri` after Step 1.3 finishes).

- [ ] **Step 1.2: Create `desktop/package.json`**

```json
{
  "name": "@utter/desktop",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.689.0",
    "@tauri-apps/api": "^2.1.1",
    "@tauri-apps/plugin-dialog": "^2.0.1",
    "@tauri-apps/plugin-shell": "^2.0.1",
    "@utter/shared": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5.0.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.1.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "happy-dom": "^15.11.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.4"
  }
}
```

(Desktop pins React 18 — Tauri's WKWebView/WebView2 are sturdier with stable React than the Next.js RC the web app uses.)

- [ ] **Step 1.3: Create `desktop/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: host || false,
    port: 5173,
    strictPort: true,
    hmr: host ? { protocol: "ws", host, port: 5174 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  envPrefix: ["VITE_", "TAURI_"],
});
```

- [ ] **Step 1.4: Create `desktop/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "noEmit": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 1.5: Create `desktop/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 1.6: Create `desktop/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700&family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Utter</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 1.7: Create `desktop/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 1.8: Create `desktop/src/App.tsx`**

```tsx
export function App() {
  return (
    <main className="min-h-screen p-12">
      <h1 className="font-display text-5xl tracking-tightest font-bold">Utter.</h1>
      <p className="text-text-1 mt-2">Tauri scaffold ready.</p>
    </main>
  );
}
```

- [ ] **Step 1.9: Create `desktop/src/index.css`**

(Same brand tokens as web; literally the global atmosphere from `docs/design/preview.html`.)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  font-family: "Geist", system-ui, sans-serif;
  --font-display: "Bricolage Grotesque", serif;
  --font-sans: "Geist", system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;
}

@layer base {
  html, body, #root {
    margin: 0; padding: 0; height: 100%; min-height: 100%;
    background: theme('colors.bg.0');
    color: theme('colors.text.0');
    font-family: var(--font-sans);
    font-feature-settings: "ss01", "ss02";
    -webkit-font-smoothing: antialiased;
  }
  body::before {
    content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(ellipse at 50% -10%, rgba(79,138,247,.06), transparent 60%),
      radial-gradient(ellipse at 80% 110%, rgba(79,138,247,.04), transparent 50%);
  }
  body::after {
    content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 1;
    mix-blend-mode: overlay; opacity: 0.7;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .035 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-thumb { background: theme('colors.line.2'); border-radius: 9999px; }
}

@keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0.25 } }
@keyframes pulse-rec { 0%, 100% { opacity: 1; transform: scale(1) } 50% { opacity: 0.5; transform: scale(0.85) } }
```

- [ ] **Step 1.10: Create `desktop/postcss.config.js`**

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 1.11: Create `desktop/tailwind.config.ts`**

(Same as web — copied so the desktop app stays self-contained and the brand stays in lockstep.)

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { 0: "#08090C", 1: "#0E1117", 2: "#161A22", 3: "#1F2530" },
        line: { 1: "#232936", 2: "#2D3548" },
        text: { 0: "#ECEEF2", 1: "#8B92A4", 2: "#5A6072" },
        accent: { DEFAULT: "#4F8AF7", hover: "#6BA3FF", tint: "rgba(79,138,247,.12)" },
        rec: "#FF4D58",
        ok: "#12B981",
        warn: "#F5A524",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { sm: "4px", DEFAULT: "6px", md: "8px", lg: "10px", xl: "14px" },
      letterSpacing: { tightest: "-0.04em", tighter: "-0.025em", wide: "0.04em", wider: "0.12em", widest: "0.18em" },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 1.12: Initialize the Tauri side**

From `desktop/`:

```bash
cd desktop
pnpm install
pnpm exec tauri init -A "Utter" -W "Utter" --frontend-dist "../dist" --dev-url "http://localhost:5173" -y --ci
```

This generates `src-tauri/`. Then overwrite the files in the next steps so they match what we want.

- [ ] **Step 1.13: Replace `desktop/src-tauri/Cargo.toml`**

```toml
[package]
name = "utter"
version = "0.1.0"
description = "Utter desktop recorder"
authors = ["you"]
edition = "2021"

[lib]
name = "utter_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.0", features = [] }

[dependencies]
tauri = { version = "2.0", features = ["tray-icon", "macos-private-api"] }
tauri-plugin-dialog = "2.0"
tauri-plugin-shell = "2.0"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
dotenvy = "0.15"
mongodb = { version = "3.1", default-features = false, features = ["tokio-runtime"] }
bson = "2.13"
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json", "multipart", "stream", "rustls-tls"], default-features = false }
anyhow = "1"
thiserror = "1"
once_cell = "1"
uuid = { version = "1", features = ["v4"] }
constant_time_eq = "0.3"
chrono = { version = "0.4", features = ["serde"] }
```

- [ ] **Step 1.14: Replace `desktop/src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 1.15: Replace `desktop/src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2.0",
  "productName": "Utter",
  "version": "0.1.0",
  "identifier": "app.utter.desktop",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Utter",
        "width": 980,
        "height": 640,
        "minWidth": 760,
        "minHeight": 540,
        "resizable": true,
        "transparent": false,
        "decorations": true,
        "fullscreen": false,
        "center": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob: https://*.r2.cloudflarestorage.com; connect-src 'self' https://*.r2.cloudflarestorage.com https://api.groq.com https://api.anthropic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com",
      "capabilities": []
    },
    "trayIcon": {
      "iconPath": "icons/icon.png",
      "iconAsTemplate": true,
      "menuOnLeftClick": true
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 1.16: Generate icons**

We need a 1024×1024 PNG seed; the Tauri CLI generates every other size from it. Generate one programmatically:

```bash
node -e "
const { writeFileSync, mkdirSync } = require('fs');
mkdirSync('src-tauri/icons', { recursive: true });
const svg = \`<svg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024'>
  <rect width='1024' height='1024' fill='#08090C'/>
  <rect x='192' y='192' width='640' height='640' rx='128' fill='#4F8AF7'/>
  <text x='512' y='720' font-family='serif' font-size='560' font-weight='700'
        text-anchor='middle' fill='white' letter-spacing='-30'>U</text>
</svg>\`;
writeFileSync('src-tauri/icons/seed.svg', svg);
"
# Convert SVG → PNG using whatever you have. macOS has 'sips' for resizing
# but not SVG; use `rsvg-convert` (brew install librsvg) OR open the SVG in a
# browser, screenshot at 1024×1024, save as src-tauri/icons/seed.png.
rsvg-convert -w 1024 -h 1024 src-tauri/icons/seed.svg -o src-tauri/icons/seed.png
pnpm exec tauri icon src-tauri/icons/seed.png
```

This generates `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`, and the platform-specific variants Tauri's bundler expects.

(If `rsvg-convert` isn't available, any 1024×1024 PNG works — even a screenshot. The icon is placeholder-grade for MVP.)

- [ ] **Step 1.17: Replace `desktop/src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    utter_lib::run();
}
```

- [ ] **Step 1.18: Create `desktop/src-tauri/src/lib.rs` (minimal stub — modules grow in later tasks)**

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

(Later tasks add `mod env;`, `mod cmds;`, etc., and the full builder chain. We commit this minimal stub first so the project compiles end-to-end before we layer logic on.)

- [ ] **Step 1.19: Verify scaffold compiles + runs**

```bash
pnpm exec tauri dev
```
Expected: Vite starts, Tauri builds the Rust shell, a window opens showing the "Utter." scaffold page. Stop with Ctrl-C.

- [ ] **Step 1.20: Commit**

```bash
git add desktop pnpm-lock.yaml
git commit -m "feat(desktop): tauri 2 scaffold with brand tokens and shared package wiring"
```

---

## Task 2: Rust env module

**Files:**
- Create: `desktop/src-tauri/src/env.rs`
- Modify: `desktop/src-tauri/src/lib.rs` (declare `mod env;`)

- [ ] **Step 2.1: Create `desktop/src-tauri/src/env.rs`**

```rust
use std::env;

#[derive(Clone, Debug)]
pub struct EnvConfig {
    pub admin_username: String,
    pub admin_password: String,
    pub mongodb_uri: String,
    pub r2_account_id: String,
    pub r2_access_key_id: String,
    pub r2_secret_access_key: String,
    pub r2_bucket: String,
    pub groq_api_key: String,
}

#[derive(Debug, thiserror::Error)]
pub enum EnvError {
    #[error("missing env var: {0}")]
    Missing(&'static str),
}

fn req(name: &'static str) -> Result<String, EnvError> {
    env::var(name).map_err(|_| EnvError::Missing(name))
}

impl EnvConfig {
    pub fn load() -> Result<Self, EnvError> {
        Ok(Self {
            admin_username:        req("ADMIN_USERNAME")?,
            admin_password:        req("ADMIN_PASSWORD")?,
            mongodb_uri:           req("MONGODB_URI")?,
            r2_account_id:         req("R2_ACCOUNT_ID")?,
            r2_access_key_id:      req("R2_ACCESS_KEY_ID")?,
            r2_secret_access_key:  req("R2_SECRET_ACCESS_KEY")?,
            r2_bucket:             req("R2_BUCKET")?,
            groq_api_key:          req("GROQ_API_KEY")?,
        })
    }
}
```

- [ ] **Step 2.2: Wire it in `lib.rs`**

Add `mod env;` near the top of `lib.rs`. Don't call it yet (the next tasks will).

- [ ] **Step 2.3: Build**

```bash
cd desktop/src-tauri
cargo build
cd ../..
```
Expected: clean build (with the simplified `run()` from Step 1.18). If it warns about unused `env` module, that's fine.

- [ ] **Step 2.4: Commit**

```bash
git add desktop/src-tauri/src/env.rs desktop/src-tauri/src/lib.rs
git commit -m "feat(desktop): rust env loader with required keys"
```

---

## Task 3: Errors + state modules

**Files:**
- Create: `desktop/src-tauri/src/errors.rs`
- Create: `desktop/src-tauri/src/state.rs`
- Modify: `desktop/src-tauri/src/lib.rs` (declare modules)

- [ ] **Step 3.1: Create `desktop/src-tauri/src/errors.rs`**

```rust
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("unauthorized")]
    Unauthorized,
    #[error("config: {0}")]
    Env(#[from] crate::env::EnvError),
    #[error("mongo: {0}")]
    Mongo(#[from] mongodb::error::Error),
    #[error("bson: {0}")]
    Bson(#[from] bson::ser::Error),
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
```

- [ ] **Step 3.2: Create `desktop/src-tauri/src/state.rs`**

```rust
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Session {
    pub token: String,
}

pub struct AppState {
    pub session: Mutex<Option<Session>>,
}

impl AppState {
    pub fn issue_session(&self) -> String {
        let token = Uuid::new_v4().to_string();
        *self.session.lock().expect("session lock") = Some(Session { token: token.clone() });
        token
    }
    pub fn validate(&self, token: &str) -> bool {
        let g = self.session.lock().expect("session lock");
        match &*g {
            Some(s) => s.token == token,
            None => false,
        }
    }
    pub fn clear(&self) {
        *self.session.lock().expect("session lock") = None;
    }
}
```

- [ ] **Step 3.3: Wire the modules in `lib.rs`**

Add `mod errors; mod state;` near the top. Update the builder to manage `AppState`:

```rust
use std::sync::Mutex;
use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState { session: Mutex::new(None) })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3.4: Build**

```bash
cd desktop/src-tauri && cargo build && cd ../..
```
Expected: clean.

- [ ] **Step 3.5: Commit**

```bash
git add desktop/src-tauri/src/errors.rs desktop/src-tauri/src/state.rs desktop/src-tauri/src/lib.rs
git commit -m "feat(desktop): app errors and in-memory session state"
```

---

## Task 4: Mongo + Groq Rust clients

**Files:**
- Create: `desktop/src-tauri/src/mongo.rs`
- Create: `desktop/src-tauri/src/groq.rs`
- Modify: `desktop/src-tauri/src/lib.rs`

- [ ] **Step 4.1: Create `desktop/src-tauri/src/mongo.rs`**

```rust
use std::sync::Arc;
use mongodb::{Client, Database, options::ClientOptions};
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use bson::{oid::ObjectId, DateTime as BsonDateTime};

use crate::errors::{AppError, AppResult};
use crate::env::EnvConfig;

static CLIENT: OnceCell<Arc<Client>> = OnceCell::new();

async fn ensure_client(uri: &str) -> AppResult<Arc<Client>> {
    if let Some(c) = CLIENT.get() { return Ok(c.clone()); }
    let opts = ClientOptions::parse(uri).await?;
    let client = Arc::new(Client::with_options(opts)?);
    let _ = CLIENT.set(client.clone());
    Ok(client)
}

pub async fn db() -> AppResult<Database> {
    let env = EnvConfig::load()?;
    let client = ensure_client(&env.mongodb_uri).await?;
    Ok(client.default_database().ok_or_else(|| AppError::Other("MONGODB_URI must include a database name".into()))?)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TranscriptSegment {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TranscriptDoc {
    pub segments: Vec<TranscriptSegment>,
    #[serde(rename = "fullText")]
    pub full_text: String,
    pub language: String,
    pub model: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageDoc {
    pub role: String,
    pub content: String,
    pub created_at: BsonDateTime,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecordingDoc {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub title: String,
    pub created_at: BsonDateTime,
    pub duration_ms: i64,
    pub size_bytes: i64,
    pub status: String, // "uploading" | "transcribing" | "ready" | "failed"
    pub r2_key: String,
    pub r2_bucket: String,
    pub mime_type: String,
    pub transcript: Option<TranscriptDoc>,
    pub chats: Vec<ChatMessageDoc>,
    pub share_token: Option<String>,
    pub failure_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentRecording {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub duration_ms: i64,
    pub status: String,
}

pub async fn list_recent(limit: i64) -> AppResult<Vec<RecentRecording>> {
    use futures_util::TryStreamExt;
    let coll = db().await?.collection::<RecordingDoc>("recordings");
    let mut cursor = coll.find(bson::doc! {})
        .sort(bson::doc! { "createdAt": -1 })
        .limit(limit)
        .await?;
    let mut out = Vec::new();
    while let Some(doc) = cursor.try_next().await? {
        out.push(RecentRecording {
            id: doc.id.map(|o| o.to_hex()).unwrap_or_default(),
            title: doc.title,
            created_at: doc.created_at.try_to_rfc3339_string().unwrap_or_default(),
            duration_ms: doc.duration_ms,
            status: doc.status,
        });
    }
    Ok(out)
}

pub async fn insert_recording(doc: RecordingDoc) -> AppResult<String> {
    let coll = db().await?.collection::<RecordingDoc>("recordings");
    let res = coll.insert_one(doc).await?;
    let id = res.inserted_id.as_object_id().ok_or_else(|| AppError::Other("inserted_id not ObjectId".into()))?;
    Ok(id.to_hex())
}

pub async fn set_transcript(recording_id: &str, transcript: TranscriptDoc) -> AppResult<()> {
    let oid = ObjectId::parse_str(recording_id).map_err(|e| AppError::Other(format!("bad id: {e}")))?;
    let coll = db().await?.collection::<RecordingDoc>("recordings");
    let t = bson::to_bson(&transcript)?;
    coll.update_one(
        bson::doc! { "_id": oid },
        bson::doc! { "$set": { "transcript": t, "status": "ready" } },
    ).await?;
    Ok(())
}

pub async fn set_failure(recording_id: &str, reason: &str) -> AppResult<()> {
    let oid = ObjectId::parse_str(recording_id).map_err(|e| AppError::Other(format!("bad id: {e}")))?;
    let coll = db().await?.collection::<RecordingDoc>("recordings");
    coll.update_one(
        bson::doc! { "_id": oid },
        bson::doc! { "$set": { "status": "failed", "failureReason": reason } },
    ).await?;
    Ok(())
}
```

- [ ] **Step 4.2: Add `futures-util` to `Cargo.toml`**

```toml
futures-util = "0.3"
```

- [ ] **Step 4.3: Create `desktop/src-tauri/src/groq.rs`**

```rust
use reqwest::multipart;
use serde::Deserialize;

use crate::errors::{AppError, AppResult};
use crate::env::EnvConfig;
use crate::mongo::{TranscriptDoc, TranscriptSegment};

#[derive(Debug, Deserialize)]
struct GroqResponse {
    text: String,
    language: String,
    segments: Option<Vec<GroqSegment>>,
}

#[derive(Debug, Deserialize)]
struct GroqSegment {
    start: f64,
    end: f64,
    text: String,
}

/// Transcribe a webm audio/video file by re-fetching it from R2 and POSTing to Groq.
pub async fn transcribe_from_r2(r2_key: &str) -> AppResult<TranscriptDoc> {
    let env = EnvConfig::load()?;
    let endpoint = format!("https://{}.r2.cloudflarestorage.com/{}/{}", env.r2_account_id, env.r2_bucket, r2_key);

    // We use a presigned URL via the S3 SDK in JS for playback, but Rust needs a different path.
    // For transcription we do a server-side download by signing here:
    let bytes = sign_and_get(&env, r2_key).await?;

    let part = multipart::Part::bytes(bytes).file_name("audio.webm").mime_str("video/webm")?;
    let form = multipart::Form::new()
        .part("file", part)
        .text("model", "whisper-large-v3")
        .text("response_format", "verbose_json")
        .text("temperature", "0");

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.groq.com/openai/v1/audio/transcriptions")
        .bearer_auth(&env.groq_api_key)
        .multipart(form)
        .send()
        .await?;
    if !resp.status().is_success() {
        let s = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Other(format!("groq {s}: {body}")));
    }
    let payload: GroqResponse = resp.json().await?;
    let segments = payload.segments.unwrap_or_default().into_iter()
        .map(|s| TranscriptSegment { start: s.start, end: s.end, text: s.text.trim().to_string() })
        .collect();
    Ok(TranscriptDoc {
        segments,
        full_text: payload.text,
        language: payload.language,
        model: "whisper-large-v3".to_string(),
    })
}

async fn sign_and_get(env: &EnvConfig, key: &str) -> AppResult<Vec<u8>> {
    // Minimal AWS S3 sigv4 GET. We only need anonymous-temporary signing because
    // the credentials live in this process's env. Use the official `aws-sdk-s3` crate
    // for parity with the JS uploader.
    use aws_credential_types::Credentials;
    use aws_sdk_s3::{config::Builder, Client};

    let creds = Credentials::new(
        &env.r2_access_key_id,
        &env.r2_secret_access_key,
        None, None, "utter-desktop",
    );
    let conf = Builder::new()
        .region(aws_sdk_s3::config::Region::new("auto"))
        .endpoint_url(format!("https://{}.r2.cloudflarestorage.com", env.r2_account_id))
        .credentials_provider(creds)
        .behavior_version_latest()
        .build();
    let client = Client::from_conf(conf);

    let resp = client.get_object()
        .bucket(&env.r2_bucket)
        .key(key)
        .send().await
        .map_err(|e| AppError::Other(e.to_string()))?;
    let bytes = resp.body.collect().await
        .map_err(|e| AppError::Other(e.to_string()))?
        .into_bytes();
    Ok(bytes.to_vec())
}
```

- [ ] **Step 4.4: Add `aws-sdk-s3` and friends to `Cargo.toml`**

```toml
aws-sdk-s3 = { version = "1.62", features = ["behavior-version-latest"] }
aws-credential-types = "1.2"
```

- [ ] **Step 4.5: Add `mod mongo; mod groq;` in `lib.rs`**

- [ ] **Step 4.6: Build**

```bash
cd desktop/src-tauri && cargo build && cd ../..
```
Expected: clean (this will pull a lot of crates the first time — be patient).

- [ ] **Step 4.7: Commit**

```bash
git add desktop/src-tauri/Cargo.toml desktop/src-tauri/src/mongo.rs desktop/src-tauri/src/groq.rs desktop/src-tauri/src/lib.rs Cargo.lock
git commit -m "feat(desktop): mongo + groq + r2 clients in rust"
```

---

## Task 5: Tauri commands (login, logout, secrets, list, register, transcribe)

**Files:**
- Create: `desktop/src-tauri/src/cmds.rs`
- Modify: `desktop/src-tauri/src/lib.rs` (register handlers)

- [ ] **Step 5.1: Create `desktop/src-tauri/src/cmds.rs`**

```rust
use serde::{Deserialize, Serialize};
use bson::DateTime as BsonDateTime;
use chrono::{DateTime, Utc};

use crate::env::EnvConfig;
use crate::errors::{AppError, AppResult};
use crate::groq;
use crate::mongo::{self, RecentRecording, RecordingDoc, ChatMessageDoc};
use crate::state::AppState;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct LoginResult { pub token: String }

#[tauri::command]
pub async fn login(state: State<'_, AppState>, username: String, password: String) -> AppResult<LoginResult> {
    let env = EnvConfig::load()?;
    let user_ok = constant_time_eq::constant_time_eq(username.as_bytes(), env.admin_username.as_bytes());
    let pass_ok = constant_time_eq::constant_time_eq(password.as_bytes(), env.admin_password.as_bytes());
    if !(user_ok && pass_ok) { return Err(AppError::Unauthorized); }
    let token = state.issue_session();
    Ok(LoginResult { token })
}

#[tauri::command]
pub fn logout(state: State<'_, AppState>) {
    state.clear();
}

#[derive(Debug, Serialize)]
pub struct PublicSecrets {
    pub r2_account_id: String,
    pub r2_access_key_id: String,
    pub r2_secret_access_key: String,
    pub r2_bucket: String,
}

#[tauri::command]
pub fn get_secrets(state: State<'_, AppState>, session: String) -> AppResult<PublicSecrets> {
    if !state.validate(&session) { return Err(AppError::Unauthorized); }
    let env = EnvConfig::load()?;
    Ok(PublicSecrets {
        r2_account_id: env.r2_account_id,
        r2_access_key_id: env.r2_access_key_id,
        r2_secret_access_key: env.r2_secret_access_key,
        r2_bucket: env.r2_bucket,
    })
}

#[tauri::command]
pub async fn list_recent(state: State<'_, AppState>, session: String) -> AppResult<Vec<RecentRecording>> {
    if !state.validate(&session) { return Err(AppError::Unauthorized); }
    mongo::list_recent(10).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterPayload {
    pub title: String,
    pub r2_key: String,
    pub duration_ms: i64,
    pub size_bytes: i64,
}

#[tauri::command]
pub async fn register_recording(state: State<'_, AppState>, session: String, payload: RegisterPayload) -> AppResult<String> {
    if !state.validate(&session) { return Err(AppError::Unauthorized); }
    let env = EnvConfig::load()?;
    let now: DateTime<Utc> = Utc::now();
    let doc = RecordingDoc {
        id: None,
        title: payload.title,
        created_at: BsonDateTime::from_chrono(now),
        duration_ms: payload.duration_ms,
        size_bytes: payload.size_bytes,
        status: "transcribing".to_string(),
        r2_key: payload.r2_key,
        r2_bucket: env.r2_bucket,
        mime_type: "video/webm".to_string(),
        transcript: None,
        chats: Vec::<ChatMessageDoc>::new(),
        share_token: None,
        failure_reason: None,
    };
    mongo::insert_recording(doc).await
}

#[tauri::command]
pub async fn transcribe_recording(state: State<'_, AppState>, session: String, recording_id: String, r2_key: String) -> AppResult<()> {
    if !state.validate(&session) { return Err(AppError::Unauthorized); }
    match groq::transcribe_from_r2(&r2_key).await {
        Ok(t) => mongo::set_transcript(&recording_id, t).await,
        Err(e) => {
            let msg = format!("{e}");
            let _ = mongo::set_failure(&recording_id, &msg).await;
            Err(e)
        }
    }
}
```

- [ ] **Step 5.2: Wire handlers in `lib.rs`**

Replace the `Builder` chain:

```rust
use std::sync::Mutex;
use crate::state::AppState;

mod env;
mod errors;
mod state;
mod mongo;
mod groq;
mod cmds;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState { session: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            cmds::login,
            cmds::logout,
            cmds::get_secrets,
            cmds::list_recent,
            cmds::register_recording,
            cmds::transcribe_recording,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5.3: Build**

```bash
cd desktop/src-tauri && cargo build && cd ../..
```
Expected: clean.

- [ ] **Step 5.4: Commit**

```bash
git add desktop/src-tauri/src/cmds.rs desktop/src-tauri/src/lib.rs Cargo.lock
git commit -m "feat(desktop): tauri commands for login, secrets, list, register, transcribe"
```

---

## Task 6: Frontend session store + auth bridge

**Files:**
- Create: `desktop/src/store/session.ts`
- Create: `desktop/src/lib/api.ts`
- Create: `desktop/src/components/Logo.tsx`
- Create: `desktop/src/components/Button.tsx`
- Create: `desktop/src/components/Kbd.tsx`

- [ ] **Step 6.1: Create `desktop/src/store/session.ts`**

```ts
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface Secrets {
  r2_account_id: string;
  r2_access_key_id: string;
  r2_secret_access_key: string;
  r2_bucket: string;
}

interface SessionState {
  token: string | null;
  secrets: Secrets | null;
  err: string | null;
  busy: boolean;
  login(username: string, password: string): Promise<boolean>;
  logout(): Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  token: null,
  secrets: null,
  err: null,
  busy: false,
  async login(username, password) {
    set({ busy: true, err: null });
    try {
      const res = await invoke<{ token: string }>("login", { username, password });
      const secrets = await invoke<Secrets>("get_secrets", { session: res.token });
      set({ token: res.token, secrets, busy: false });
      return true;
    } catch (e: any) {
      set({ err: typeof e === "string" ? e : (e?.message ?? "Login failed"), busy: false });
      return false;
    }
  },
  async logout() {
    await invoke("logout").catch(() => {});
    set({ token: null, secrets: null });
  },
}));
```

- [ ] **Step 6.2: Create `desktop/src/lib/api.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";

export interface RecentRecording {
  id: string;
  title: string;
  createdAt: string;
  durationMs: number;
  status: "uploading" | "transcribing" | "ready" | "failed";
}

export async function listRecent(session: string): Promise<RecentRecording[]> {
  const raw = await invoke<Array<{ id: string; title: string; createdAt: string; durationMs: number; status: string }>>(
    "list_recent",
    { session },
  );
  return raw.map((r) => ({ ...r, status: r.status as RecentRecording["status"] }));
}

export interface RegisterPayload {
  title: string;
  r2Key: string;
  durationMs: number;
  sizeBytes: number;
}

export async function registerRecording(session: string, payload: RegisterPayload): Promise<string> {
  return invoke<string>("register_recording", { session, payload });
}

export async function transcribeRecording(session: string, recordingId: string, r2Key: string): Promise<void> {
  await invoke("transcribe_recording", { session, recordingId, r2Key });
}
```

- [ ] **Step 6.3: Create the small UI atoms**

`desktop/src/components/Logo.tsx`:

```tsx
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-md bg-accent text-white font-display font-bold leading-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),0_4px_12px_rgba(79,138,247,0.3)]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55), letterSpacing: "-0.04em" }}
      aria-hidden
    >U</span>
  );
}
```

`desktop/src/components/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({ variant = "primary", size = "md", className = "", ...rest }: Props) {
  const base = "inline-flex items-center justify-center rounded font-medium select-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizing = size === "sm" ? "h-7 px-3 text-xs" : "h-9 px-4 text-sm";
  const skin =
    variant === "primary" ? "bg-accent text-white hover:bg-accent-hover" :
    variant === "danger"  ? "bg-rec text-white hover:bg-[#FF6670]" :
                            "bg-bg-3 text-text-0 border border-line-2 hover:bg-line-2";
  return <button className={`${base} ${sizing} ${skin} ${className}`} {...rest} />;
}
```

`desktop/src/components/Kbd.tsx`:

```tsx
import type { ReactNode } from "react";
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="font-mono text-[10.5px] bg-bg-2 border border-line-1 border-b-2 text-text-0 px-1.5 py-[1px] rounded mx-0.5">
      {children}
    </kbd>
  );
}
```

- [ ] **Step 6.4: Commit**

```bash
git add desktop/src/store desktop/src/lib desktop/src/components
git commit -m "feat(desktop): session store, api bridge, base atoms"
```

---

## Task 7: Login screen

**Files:**
- Create: `desktop/src/screens/Login.tsx`
- Modify: `desktop/src/App.tsx`

- [ ] **Step 7.1: Create `desktop/src/screens/Login.tsx`**

```tsx
import { useState } from "react";
import { useSession } from "@/store/session";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { Kbd } from "@/components/Kbd";

export function Login() {
  const { login, busy, err } = useSession();
  const [u, setU] = useState("");
  const [p, setP] = useState("");

  return (
    <main className="min-h-screen grid place-items-center px-6 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-25 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
        style={{ backgroundImage: "linear-gradient(#232936 1px, transparent 1px), linear-gradient(90deg, #232936 1px, transparent 1px)", backgroundSize: "32px 32px" }}
      />
      <form
        onSubmit={(e) => { e.preventDefault(); void login(u, p); }}
        className="relative z-10 w-full max-w-sm bg-bg-1 border border-line-1 rounded-lg p-8 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.8)]"
      >
        <div className="flex items-center gap-2.5 mb-7">
          <Logo />
          <span className="font-display font-semibold text-lg tracking-tighter">Utter</span>
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tighter mb-1">Welcome back.</h1>
        <p className="text-text-1 text-sm mb-6">Admin sign-in.</p>

        <label className="block mb-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-2 mb-1.5 block">Username</span>
          <input value={u} onChange={(e) => setU(e.target.value)} autoFocus required
            className="w-full bg-bg-2 border border-line-1 focus:border-line-2 outline-none rounded px-3 py-2 text-sm" />
        </label>
        <label className="block mb-5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-2 mb-1.5 block">Password</span>
          <input type="password" value={p} onChange={(e) => setP(e.target.value)} required
            className="w-full bg-bg-2 border border-line-1 focus:border-line-2 outline-none rounded px-3 py-2 text-sm" />
        </label>
        {err && <p className="text-rec text-xs mb-4 font-mono uppercase tracking-wider">{err}</p>}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <p className="mt-4 text-text-2 text-xs">Press <Kbd>↩</Kbd> to submit.</p>
      </form>
    </main>
  );
}
```

- [ ] **Step 7.2: Update `desktop/src/App.tsx`**

```tsx
import { useSession } from "@/store/session";
import { Login } from "@/screens/Login";

export function App() {
  const token = useSession((s) => s.token);
  if (!token) return <Login />;
  return (
    <main className="p-12">
      <h1 className="font-display text-5xl tracking-tightest font-bold">Logged in.</h1>
      <p className="text-text-1 mt-2">Idle screen comes next.</p>
    </main>
  );
}
```

- [ ] **Step 7.3: Manual run**

Create `desktop/.env` from the template (we'll formalize the example in Task 23):

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=hunter2
MONGODB_URI=mongodb://localhost:27017/utter
R2_ACCOUNT_ID=test
R2_ACCESS_KEY_ID=test
R2_SECRET_ACCESS_KEY=test
R2_BUCKET=utter
GROQ_API_KEY=test
```

```bash
pnpm --filter @utter/desktop tauri dev
```

Expected: window opens to login. Wrong creds → error message; correct creds → "Logged in." Stop.

- [ ] **Step 7.4: Commit**

```bash
git add desktop/src/App.tsx desktop/src/screens
git commit -m "feat(desktop): login screen wired to rust auth command"
```

---

## Task 8: Capture pipeline — display + mic + audio mixer

**Files:**
- Create: `desktop/src/recording/capture.ts`
- Create: `desktop/src/recording/__tests__/capture.test.ts`
- Create: `desktop/vitest.config.ts`

- [ ] **Step 8.1: Create `desktop/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "happy-dom", globals: true },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

- [ ] **Step 8.2: Implement the capture utilities**

```ts
// desktop/src/recording/capture.ts

export type AudioMode = "mic" | "system" | "both";

export interface CaptureBundle {
  /** The combined stream that will be fed into MediaRecorder. */
  stream: MediaStream;
  /** Underlying tracks so callers can stop them on stop(). */
  tracks: MediaStreamTrack[];
  /** Source label captured from the OS picker (best effort). */
  sourceLabel: string;
  /** Web Audio context and analyser for level metering. */
  audioContext: AudioContext;
  analyser: AnalyserNode;
}

interface CaptureOptions {
  mode: AudioMode;
}

export async function startCapture({ mode }: CaptureOptions): Promise<CaptureBundle> {
  // 1. Display (video + system audio when available)
  const wantSystemAudio = mode === "system" || mode === "both";
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "window", frameRate: 30 } as MediaTrackConstraints,
    audio: wantSystemAudio,
  });

  // 2. Mic if requested
  let mic: MediaStream | null = null;
  if (mode === "mic" || mode === "both") {
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  }

  // 3. Mix audio via Web Audio
  const audioContext = new AudioContext();
  const dest = audioContext.createMediaStreamDestination();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;

  const tap = audioContext.createGain(); // tap to feed analyser
  tap.gain.value = 1;
  tap.connect(dest);
  tap.connect(analyser);

  const tracks: MediaStreamTrack[] = [];
  const videoTrack = display.getVideoTracks()[0];
  if (!videoTrack) throw new Error("No video track from getDisplayMedia");
  tracks.push(videoTrack);

  const sysAudioTrack = display.getAudioTracks()[0] ?? null;
  if (sysAudioTrack && wantSystemAudio) {
    const sysSrc = audioContext.createMediaStreamSource(new MediaStream([sysAudioTrack]));
    sysSrc.connect(tap);
    tracks.push(sysAudioTrack);
  }
  if (mic) {
    const micTrack = mic.getAudioTracks()[0]!;
    const micSrc = audioContext.createMediaStreamSource(new MediaStream([micTrack]));
    micSrc.connect(tap);
    tracks.push(micTrack);
  }

  const mixedAudioTrack = dest.stream.getAudioTracks()[0]!;
  const stream = new MediaStream([videoTrack, mixedAudioTrack]);

  const sourceLabel = videoTrack.label || "Window";
  return { stream, tracks, sourceLabel, audioContext, analyser };
}

export function stopCapture(b: CaptureBundle) {
  for (const t of b.tracks) t.stop();
  b.audioContext.close().catch(() => {});
}

/** RMS of a single frame of analyser data, normalized to [0, 1]. */
export function readLevel(analyser: AnalyserNode): number {
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i]! - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / buf.length);
}
```

- [ ] **Step 8.3: Create `desktop/src/recording/__tests__/capture.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { readLevel } from "../capture";

describe("readLevel", () => {
  it("returns 0 for silence", () => {
    const fakeAnalyser = {
      fftSize: 4,
      getByteTimeDomainData(arr: Uint8Array) { arr.fill(128); },
    } as unknown as AnalyserNode;
    expect(readLevel(fakeAnalyser)).toBe(0);
  });
  it("returns >0 for non-zero signal", () => {
    const fakeAnalyser = {
      fftSize: 4,
      getByteTimeDomainData(arr: Uint8Array) { arr[0] = 200; arr[1] = 60; arr[2] = 200; arr[3] = 60; },
    } as unknown as AnalyserNode;
    expect(readLevel(fakeAnalyser)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 8.4: Run tests**

```bash
pnpm --filter @utter/desktop test
```
Expected: 2 passing.

- [ ] **Step 8.5: Commit**

```bash
git add desktop/src/recording desktop/vitest.config.ts
git commit -m "feat(desktop): display + mic capture and web audio mixer"
```

---

## Task 9: R2 multipart streaming uploader

**Files:**
- Create: `desktop/src/recording/uploader.ts`
- Create: `desktop/src/recording/__tests__/uploader.test.ts`

The uploader buffers `MediaRecorder` blobs until they exceed 5 MiB (R2 minimum part size), then uploads each as a `UploadPart`. The final blob is uploaded as the last part regardless of size.

- [ ] **Step 9.1: Write the failing test**

```ts
// desktop/src/recording/__tests__/uploader.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Uploader, MIN_PART_SIZE } from "../uploader";

class FakeS3 {
  startCalls = 0;
  parts: Array<{ partNumber: number; size: number }> = [];
  completed = false;
  abort = false;
  uploadId = "upl-1";
  async createMultipartUpload() { this.startCalls++; return { UploadId: this.uploadId }; }
  async uploadPart({ PartNumber, Body }: { PartNumber: number; Body: Uint8Array }) {
    this.parts.push({ partNumber: PartNumber, size: Body.length });
    return { ETag: `"etag-${PartNumber}"` };
  }
  async completeMultipartUpload() { this.completed = true; return { Location: "s3://bucket/key" }; }
  async abortMultipartUpload() { this.abort = true; }
}

function blob(size: number) { return new Blob([new Uint8Array(size)]); }

describe("Uploader", () => {
  let s3: FakeS3;
  let u: Uploader;
  beforeEach(() => {
    s3 = new FakeS3();
    u = new Uploader({ s3: s3 as any, bucket: "b", key: "k" });
  });

  it("does not upload tiny chunks; flushes once size exceeds MIN_PART_SIZE", async () => {
    await u.start();
    await u.push(blob(1024 * 1024)); // 1 MiB
    await u.push(blob(2 * 1024 * 1024)); // 2 MiB
    expect(s3.parts).toHaveLength(0);
    await u.push(blob(3 * 1024 * 1024)); // 3 MiB → total 6 MiB → flush
    expect(s3.parts).toEqual([{ partNumber: 1, size: 6 * 1024 * 1024 }]);
  });

  it("flushes the trailing buffer (any size) on complete()", async () => {
    await u.start();
    await u.push(blob(MIN_PART_SIZE)); // 5 MiB → flush
    await u.push(blob(100 * 1024)); // tiny remainder
    const out = await u.complete();
    expect(s3.parts.map((p) => p.partNumber)).toEqual([1, 2]);
    expect(s3.completed).toBe(true);
    expect(out.size).toBe(MIN_PART_SIZE + 100 * 1024);
  });

  it("calls abort on cancel()", async () => {
    await u.start();
    await u.cancel();
    expect(s3.abort).toBe(true);
  });

  it("retries a failing UploadPart up to 3 times", async () => {
    let calls = 0;
    s3.uploadPart = vi.fn(async ({ PartNumber }) => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return { ETag: `"etag-${PartNumber}"` };
    });
    await u.start();
    await u.push(blob(MIN_PART_SIZE));
    expect(calls).toBe(3);
  });
});
```

- [ ] **Step 9.2: Run the test (fails)**

Expected: FAIL.

- [ ] **Step 9.3: Implement `desktop/src/recording/uploader.ts`**

```ts
import type { S3Client } from "@aws-sdk/client-s3";
import { CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from "@aws-sdk/client-s3";

export const MIN_PART_SIZE = 5 * 1024 * 1024;

interface UploaderOpts {
  s3: S3Client;
  bucket: string;
  key: string;
  contentType?: string;
}

interface CompleteResult { uploadId: string; etag: string; size: number }

export class Uploader {
  private buffer: Uint8Array[] = [];
  private buffered = 0;
  private uploadedParts: Array<{ ETag: string; PartNumber: number }> = [];
  private partNumber = 1;
  private uploadId: string | null = null;
  private totalBytes = 0;

  constructor(private opts: UploaderOpts) {}

  async start(): Promise<void> {
    const cmd = new CreateMultipartUploadCommand({
      Bucket: this.opts.bucket,
      Key: this.opts.key,
      ContentType: this.opts.contentType ?? "video/webm",
    });
    const out = await this.opts.s3.send(cmd);
    if (!out.UploadId) throw new Error("R2 did not return UploadId");
    this.uploadId = out.UploadId;
  }

  async push(blob: Blob): Promise<void> {
    if (!this.uploadId) throw new Error("Uploader not started");
    const buf = new Uint8Array(await blob.arrayBuffer());
    this.buffer.push(buf);
    this.buffered += buf.byteLength;
    this.totalBytes += buf.byteLength;
    if (this.buffered >= MIN_PART_SIZE) await this.flushPart(false);
  }

  async complete(): Promise<CompleteResult> {
    if (!this.uploadId) throw new Error("Uploader not started");
    if (this.buffered > 0) await this.flushPart(true);
    const out = await this.opts.s3.send(new CompleteMultipartUploadCommand({
      Bucket: this.opts.bucket,
      Key: this.opts.key,
      UploadId: this.uploadId,
      MultipartUpload: { Parts: this.uploadedParts },
    }));
    return { uploadId: this.uploadId, etag: out.ETag ?? "", size: this.totalBytes };
  }

  async cancel(): Promise<void> {
    if (!this.uploadId) return;
    await this.opts.s3.send(new AbortMultipartUploadCommand({
      Bucket: this.opts.bucket,
      Key: this.opts.key,
      UploadId: this.uploadId,
    })).catch(() => {});
    this.uploadId = null;
  }

  private async flushPart(_isFinal: boolean): Promise<void> {
    const body = concat(this.buffer);
    this.buffer = [];
    this.buffered = 0;
    const partNumber = this.partNumber++;
    const etag = await this.uploadPartWithRetry(partNumber, body);
    this.uploadedParts.push({ ETag: etag, PartNumber: partNumber });
  }

  private async uploadPartWithRetry(partNumber: number, body: Uint8Array): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const out = await this.opts.s3.send(new UploadPartCommand({
          Bucket: this.opts.bucket,
          Key: this.opts.key,
          UploadId: this.uploadId!,
          PartNumber: partNumber,
          Body: body,
        }));
        if (!out.ETag) throw new Error("Missing ETag");
        return out.ETag;
      } catch (err) {
        lastErr = err;
        await sleep(200 * Math.pow(2, attempt));
      }
    }
    throw lastErr;
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.byteLength; }
  return out;
}

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }
```

- [ ] **Step 9.4: Run tests**

Expected: 4 passing.

- [ ] **Step 9.5: Commit**

```bash
git add desktop/src/recording/uploader.ts desktop/src/recording/__tests__/uploader.test.ts
git commit -m "feat(desktop): r2 multipart streaming uploader with retry"
```

---

## Task 10: Recording session orchestrator

**Files:**
- Create: `desktop/src/recording/session.ts`

This wires capture + MediaRecorder + Uploader together, exposes a small state machine, and emits level samples.

- [ ] **Step 10.1: Implement `desktop/src/recording/session.ts`**

```ts
import { S3Client } from "@aws-sdk/client-s3";
import { startCapture, stopCapture, readLevel, type AudioMode, type CaptureBundle } from "./capture";
import { Uploader } from "./uploader";
import type { Secrets } from "@/store/session";

export type SessionState = "idle" | "starting" | "recording" | "stopping" | "completed" | "error";

export interface SessionSnapshot {
  state: SessionState;
  elapsedMs: number;
  level: number;
  sourceLabel: string;
  bytes: number;
  err: string | null;
}

export interface SessionResult {
  r2Key: string;
  durationMs: number;
  sizeBytes: number;
}

interface StartArgs {
  secrets: Secrets;
  audioMode: AudioMode;
  onUpdate(s: SessionSnapshot): void;
}

export class RecorderSession {
  private capture: CaptureBundle | null = null;
  private recorder: MediaRecorder | null = null;
  private uploader: Uploader | null = null;
  private startedAt = 0;
  private rafId: number | null = null;
  private state: SessionState = "idle";
  private bytes = 0;
  private err: string | null = null;
  private level = 0;
  private label = "";
  private resolveResult: ((r: SessionResult) => void) | null = null;
  private rejectResult: ((e: unknown) => void) | null = null;
  private pendingPushes: Promise<void>[] = [];
  private r2Key = "";

  async start({ secrets, audioMode, onUpdate }: StartArgs): Promise<SessionResult> {
    if (this.state !== "idle") throw new Error("Already running");
    this.setState("starting", onUpdate);

    try {
      this.capture = await startCapture({ mode: audioMode });
      this.label = this.capture.sourceLabel;

      const s3 = new S3Client({
        region: "auto",
        endpoint: `https://${secrets.r2_account_id}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: secrets.r2_access_key_id,
          secretAccessKey: secrets.r2_secret_access_key,
        },
      });
      this.r2Key = `recordings/${dateFolder()}/${rid()}.webm`;
      this.uploader = new Uploader({ s3, bucket: secrets.r2_bucket, key: this.r2Key, contentType: "video/webm" });
      await this.uploader.start();

      const recorder = new MediaRecorder(this.capture.stream, {
        mimeType: "video/webm; codecs=vp9,opus",
        videoBitsPerSecond: 2_500_000,
      });
      recorder.ondataavailable = (ev) => {
        if (!ev.data || ev.data.size === 0) return;
        this.bytes += ev.data.size;
        const p = this.uploader!.push(ev.data).catch((e) => { this.err = String(e); });
        this.pendingPushes.push(p);
      };
      recorder.onerror = (ev) => {
        this.err = String((ev as ErrorEvent).error ?? "MediaRecorder error");
        this.setState("error", onUpdate);
      };
      this.capture.tracks.forEach((t) => {
        t.addEventListener("ended", () => {
          if (this.state === "recording") void this.stop();
        });
      });

      recorder.start(5000); // emit 5s chunks
      this.recorder = recorder;
      this.startedAt = performance.now();
      this.setState("recording", onUpdate);
      this.tickLevels(onUpdate);
    } catch (e) {
      this.err = String(e);
      await this.cleanupOnFailure();
      this.setState("error", onUpdate);
      throw e;
    }

    return new Promise<SessionResult>((resolve, reject) => {
      this.resolveResult = resolve;
      this.rejectResult = reject;
    });
  }

  async stop(): Promise<void> {
    if (this.state !== "recording") return;
    this.setState("stopping", () => {});
    try {
      const recorder = this.recorder!;
      const stopped = new Promise<void>((res) => { recorder.onstop = () => res(); });
      recorder.stop();
      await stopped;
      await Promise.all(this.pendingPushes);

      const result = await this.uploader!.complete();
      const durationMs = Math.max(0, performance.now() - this.startedAt);
      this.setState("completed", () => {});
      this.cleanup();
      this.resolveResult?.({ r2Key: this.r2Key, durationMs, sizeBytes: result.size });
    } catch (e) {
      this.err = String(e);
      this.rejectResult?.(e);
    }
  }

  async cancel(): Promise<void> {
    try { await this.uploader?.cancel(); } catch { /* ignore */ }
    this.cleanup();
    this.setState("idle", () => {});
  }

  private async cleanupOnFailure() {
    try { await this.uploader?.cancel(); } catch { /* ignore */ }
    this.cleanup();
  }

  private cleanup() {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.capture) stopCapture(this.capture);
    this.capture = null;
    this.recorder = null;
    this.uploader = null;
  }

  private setState(s: SessionState, onUpdate: (s: SessionSnapshot) => void) {
    this.state = s;
    onUpdate(this.snapshot());
  }

  private tickLevels(onUpdate: (s: SessionSnapshot) => void) {
    const tick = () => {
      if (this.state !== "recording") return;
      this.level = this.capture ? readLevel(this.capture.analyser) : 0;
      onUpdate(this.snapshot());
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private snapshot(): SessionSnapshot {
    return {
      state: this.state,
      elapsedMs: this.startedAt ? Math.max(0, performance.now() - this.startedAt) : 0,
      level: this.level,
      sourceLabel: this.label,
      bytes: this.bytes,
      err: this.err,
    };
  }
}

function rid(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
}
function dateFolder(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
```

- [ ] **Step 10.2: Commit**

```bash
git add desktop/src/recording/session.ts
git commit -m "feat(desktop): recorder session orchestrator (capture + media recorder + uploader)"
```

---

## Task 11: Idle screen UI

**Files:**
- Create: `desktop/src/screens/Idle.tsx`
- Create: `desktop/src/components/AudioSourceSelector.tsx`
- Create: `desktop/src/components/RecentList.tsx`
- Create: `desktop/src/components/Titlebar.tsx`
- Modify: `desktop/src/App.tsx`

- [ ] **Step 11.1: Create `desktop/src/components/Titlebar.tsx`**

```tsx
export function Titlebar() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-line-1 bg-black/[0.2]">
      <div className="flex gap-2">
        <span className="w-3 h-3 rounded-full bg-bg-3" />
        <span className="w-3 h-3 rounded-full bg-bg-3" />
        <span className="w-3 h-3 rounded-full bg-bg-3" />
      </div>
      <span className="font-mono text-[11px] uppercase tracking-wider text-text-2">UTTER · Desktop</span>
    </div>
  );
}
```

- [ ] **Step 11.2: Create `desktop/src/components/AudioSourceSelector.tsx`**

```tsx
import type { AudioMode } from "@/recording/capture";

interface Props { value: AudioMode; onChange(v: AudioMode): void; isMac: boolean }

const OPTIONS: Array<{ id: AudioMode; name: string; desc: (mac: boolean) => string }> = [
  { id: "mic", name: "Mic only", desc: () => "Your voice from the system mic." },
  { id: "both", name: "Mic + System", desc: (mac) => mac ? "You and the meeting. Needs BlackHole on macOS." : "You and the meeting." },
  { id: "system", name: "System only", desc: (mac) => mac ? "Just the meeting audio. Needs BlackHole on macOS." : "Just the meeting audio." },
];

export function AudioSourceSelector({ value, onChange, isMac }: Props) {
  return (
    <div>
      <div className="font-mono text-[10.5px] uppercase tracking-widest text-text-2 mb-2.5">Audio source</div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => {
          const active = o.id === value;
          return (
            <button key={o.id} type="button" onClick={() => onChange(o.id)}
              className={`text-left p-3.5 rounded-md border transition-colors relative ${
                active
                  ? "border-accent bg-gradient-to-b from-accent/[0.12] to-transparent"
                  : "bg-bg-2 border-line-1 hover:border-line-2"
              }`}>
              {active && <span className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--tw-shadow-color)] shadow-accent" />}
              <p className="font-semibold text-[13.5px] mb-1">{o.name}</p>
              <p className="text-[11.5px] text-text-1 leading-snug">{o.desc(isMac)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 11.3: Create `desktop/src/components/RecentList.tsx`**

```tsx
import { useEffect, useState } from "react";
import { listRecent, type RecentRecording } from "@/lib/api";
import { useSession } from "@/store/session";

const TAG: Record<RecentRecording["status"], { label: string; cls: string }> = {
  ready:        { label: "READY",     cls: "text-ok      bg-ok/[0.1]"  },
  uploading:    { label: "UPLOAD",    cls: "text-warn    bg-warn/[0.1]" },
  transcribing: { label: "TRANSCRIBE",cls: "text-accent  bg-accent/[0.1]" },
  failed:       { label: "FAILED",    cls: "text-rec     bg-rec/[0.1]" },
};

export function RecentList() {
  const token = useSession((s) => s.token);
  const [items, setItems] = useState<RecentRecording[]>([]);

  useEffect(() => {
    if (!token) return;
    listRecent(token).then(setItems).catch(() => setItems([]));
  }, [token]);

  if (items.length === 0) {
    return <p className="text-text-2 text-[13px]">No recordings yet. Press record to make your first.</p>;
  }
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-2 py-2.5 -mx-2 rounded hover:bg-bg-2">
          <Thumb />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] truncate">{r.title}</p>
            <p className="font-mono text-[10.5px] text-text-2 tracking-wide mt-0.5">
              {Math.round(r.durationMs / 60000)}m · {new Date(r.createdAt).toLocaleDateString().toUpperCase()}
            </p>
          </div>
          <span className={`font-mono text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${TAG[r.status].cls}`}>
            ●&nbsp;{TAG[r.status].label}
          </span>
        </div>
      ))}
    </div>
  );
}

function Thumb() {
  return (
    <div className="w-11 h-7 rounded-sm border border-line-1 bg-gradient-to-br from-bg-3 to-bg-1 relative shrink-0">
      <span className="absolute left-[38%] top-1/2 -translate-y-1/2 border-l-[7px] border-l-text-1 border-y-[5px] border-y-transparent" />
    </div>
  );
}
```

- [ ] **Step 11.4: Create `desktop/src/screens/Idle.tsx`**

```tsx
import { useState } from "react";
import { Titlebar } from "@/components/Titlebar";
import { AudioSourceSelector } from "@/components/AudioSourceSelector";
import { RecentList } from "@/components/RecentList";
import { Kbd } from "@/components/Kbd";
import type { AudioMode } from "@/recording/capture";

interface Props { onStart(mode: AudioMode): void }

const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

export function Idle({ onStart }: Props) {
  const [mode, setMode] = useState<AudioMode>("both");

  return (
    <div className="min-h-screen flex flex-col">
      <Titlebar />
      <div className="grid grid-cols-[1fr_360px] flex-1">
        <section className="px-14 py-12 flex flex-col gap-9">
          <span className="font-mono text-[10.5px] uppercase tracking-widest text-text-2">Ready</span>
          <h1 className="font-display text-[44px] leading-[1.05] tracking-tightest font-semibold max-w-[14ch] m-0">
            Press record. <em className="not-italic text-accent">Pick a window.</em> The rest is automatic.
          </h1>
          <div className="flex items-center gap-6">
            <button
              onClick={() => onStart(mode)}
              aria-label="Start recording"
              className="w-24 h-24 rounded-full relative cursor-pointer border border-rec/40 transition-transform hover:scale-[1.03] focus:outline-none"
              style={{
                background: "radial-gradient(circle at 35% 30%, #FF6770, #C42730)",
                boxShadow: `
                  0 0 0 6px rgba(255,77,88,.08),
                  0 18px 36px -12px rgba(255,77,88,.4),
                  inset 0 1px 0 rgba(255,255,255,.2),
                  inset 0 -10px 20px rgba(0,0,0,.3)`,
              }}
            >
              <span className="absolute inset-[32%] rounded-md bg-white/95" />
            </button>
            <div>
              <p className="font-display font-semibold text-[22px] tracking-tighter mb-1">Start recording</p>
              <p className="text-text-1 text-[13px]">Or press <Kbd>⌘</Kbd><Kbd>⇧</Kbd><Kbd>R</Kbd> from anywhere.</p>
            </div>
          </div>
          <AudioSourceSelector value={mode} onChange={setMode} isMac={isMac} />
        </section>

        <aside className="border-l border-line-1 bg-black/[0.15] p-7 flex flex-col gap-5">
          <header className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-widest text-text-2">
            <span>Recent</span>
            <span className="text-accent text-[12px] tracking-normal normal-case font-sans">All →</span>
          </header>
          <RecentList />
          <footer className="mt-auto pt-4 border-t border-line-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-text-2">
            <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-ok mr-1.5 align-middle shadow-[0_0_8px_var(--tw-shadow-color)] shadow-ok" />R2 Online</span>
            <span>38ms</span>
          </footer>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 11.5: Wire it in `App.tsx`**

```tsx
import { useSession } from "@/store/session";
import { Login } from "@/screens/Login";
import { Idle } from "@/screens/Idle";
import { RecorderShell } from "@/screens/RecorderShell";
import { useState } from "react";
import type { AudioMode } from "@/recording/capture";

export function App() {
  const token = useSession((s) => s.token);
  const [recording, setRecording] = useState<AudioMode | null>(null);

  if (!token) return <Login />;
  if (recording) return <RecorderShell mode={recording} onDone={() => setRecording(null)} />;
  return <Idle onStart={(m) => setRecording(m)} />;
}
```

(`RecorderShell` is created in the next task. The app won't compile until then — that's OK, we'll commit after the next task.)

- [ ] **Step 11.6: Commit (Idle screen only)**

```bash
git add desktop/src/components/Titlebar.tsx desktop/src/components/AudioSourceSelector.tsx desktop/src/components/RecentList.tsx desktop/src/screens/Idle.tsx
git commit -m "feat(desktop): idle screen with record button, source selector, recents"
```

---

## Task 12: Recording shell + floating pill

**Files:**
- Create: `desktop/src/screens/RecorderShell.tsx`
- Create: `desktop/src/components/RecordingPill.tsx`
- Create: `desktop/src/components/LevelMeter.tsx`

- [ ] **Step 12.1: Create `desktop/src/components/LevelMeter.tsx`**

```tsx
interface Props { level: number /* 0..1 */ }

const BARS = 5;

export function LevelMeter({ level }: Props) {
  // Map level (RMS, typically 0..0.3) into per-bar heights with a little jitter.
  const heights = Array.from({ length: BARS }, (_, i) => {
    const phase = i / BARS;
    const eased = Math.min(1, level * 4);
    const wobble = Math.sin(performance.now() / 80 + phase * 6.28) * 0.15;
    return Math.max(0.15, Math.min(1, eased + wobble));
  });
  return (
    <div className="flex gap-[2px] items-end h-[18px]">
      {heights.map((h, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-[1px] ${i === 2 ? "bg-accent" : "bg-text-2"}`}
          style={{ height: `${Math.round(h * 100)}%`, transition: "height 80ms linear" }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 12.2: Create `desktop/src/components/RecordingPill.tsx`**

```tsx
import { LevelMeter } from "./LevelMeter";
import { Button } from "./Button";

interface Props {
  elapsedMs: number;
  level: number;
  source: string;
  onStop(): void;
}

export function RecordingPill({ elapsedMs, level, source, onStop }: Props) {
  return (
    <div className="rounded-full border border-line-2 bg-bg-1/85 backdrop-blur px-4 py-2.5 flex items-center gap-3.5 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.6)]">
      <span className="w-2 h-2 rounded-full bg-rec animate-[pulse-rec_1.4s_ease-in-out_infinite] shadow-[0_0_12px_var(--tw-shadow-color)] shadow-rec" />
      <span className="font-mono text-sm tabular-nums tracking-wide">{formatHms(elapsedMs)}</span>
      <LevelMeter level={level} />
      <span className="w-px h-4 bg-line-2" />
      <span className="font-mono text-[10.5px] uppercase tracking-widest text-text-2 max-w-[160px] truncate">{source}</span>
      <Button variant="danger" size="sm" onClick={onStop}>■ Stop</Button>
    </div>
  );
}

function formatHms(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
function pad(n: number) { return n.toString().padStart(2, "0"); }
```

- [ ] **Step 12.3: Create `desktop/src/screens/RecorderShell.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { RecorderSession, type SessionSnapshot } from "@/recording/session";
import type { AudioMode } from "@/recording/capture";
import { useSession } from "@/store/session";
import { RecordingPill } from "@/components/RecordingPill";
import { registerRecording, transcribeRecording } from "@/lib/api";

interface Props { mode: AudioMode; onDone(): void }

const initial: SessionSnapshot = { state: "starting", elapsedMs: 0, level: 0, sourceLabel: "", bytes: 0, err: null };

export function RecorderShell({ mode, onDone }: Props) {
  const { token, secrets } = useSession((s) => ({ token: s.token, secrets: s.secrets }));
  const [snap, setSnap] = useState<SessionSnapshot>(initial);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"recording" | "uploading" | "transcribing" | "done">("recording");
  const sessRef = useRef<RecorderSession | null>(null);

  useEffect(() => {
    if (!token || !secrets) return;
    const sess = new RecorderSession();
    sessRef.current = sess;
    sess.start({ secrets, audioMode: mode, onUpdate: setSnap })
      .then(async (result) => {
        setPhase("uploading");
        const id = await registerRecording(token, {
          title: `Recording — ${new Date().toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
          r2Key: result.r2Key,
          durationMs: Math.round(result.durationMs),
          sizeBytes: result.sizeBytes,
        });
        setPhase("transcribing");
        try { await transcribeRecording(token, id, result.r2Key); } catch { /* shown by status */ }
        setPhase("done");
        setTimeout(onDone, 1200);
      })
      .catch((e) => setError(String(e)));
    return () => {
      sessRef.current?.cancel();
      sessRef.current = null;
    };
  }, [token, secrets, mode, onDone]);

  if (error) {
    return (
      <main className="min-h-screen grid place-items-center px-6">
        <div className="max-w-md text-center">
          <p className="font-mono text-[11px] uppercase tracking-wider text-rec mb-3">Recording error</p>
          <h1 className="font-display text-3xl font-semibold tracking-tighter mb-3">{error}</h1>
          <button onClick={onDone} className="text-accent hover:text-accent-hover">← Back</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen relative">
      <div
        aria-hidden
        className="absolute inset-0 opacity-25 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
        style={{ backgroundImage: "linear-gradient(#232936 1px, transparent 1px), linear-gradient(90deg, #232936 1px, transparent 1px)", backgroundSize: "32px 32px" }}
      />
      <div className="relative z-10 grid place-items-center min-h-screen">
        <RecordingPill
          elapsedMs={snap.elapsedMs}
          level={snap.level}
          source={snap.sourceLabel || "Window"}
          onStop={() => sessRef.current?.stop()}
        />
        {phase !== "recording" && (
          <p className="mt-6 font-mono text-[11px] uppercase tracking-wider text-text-2">
            {phase === "uploading" && "Finalizing upload…"}
            {phase === "transcribing" && "Transcribing with Groq…"}
            {phase === "done" && <span className="text-ok">● Done</span>}
          </p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 12.4: Run end-to-end manual test**

(Requires real R2 + Mongo + Groq creds in `desktop/.env`.)

```bash
pnpm --filter @utter/desktop tauri dev
```

1. Sign in.
2. Click record. Pick a window from the OS picker.
3. Talk into your mic for 15 seconds.
4. Click Stop.

Expected: pill shows elapsed time + animated meter; stop triggers "Finalizing upload…" then "Transcribing…" then "● Done"; the recording shows up in the web app's `/` after refresh.

- [ ] **Step 12.5: Commit**

```bash
git add desktop/src/components/LevelMeter.tsx desktop/src/components/RecordingPill.tsx desktop/src/screens/RecorderShell.tsx desktop/src/App.tsx
git commit -m "feat(desktop): recorder shell with floating pill, post-stop pipeline"
```

---

## Task 13: System tray + global hotkey

**Files:**
- Modify: `desktop/src-tauri/src/lib.rs`
- Modify: `desktop/src-tauri/Cargo.toml`
- Create: `desktop/src-tauri/capabilities/main.json`
- Modify: `desktop/src-tauri/tauri.conf.json` (add capabilities reference)
- Modify: `desktop/src/App.tsx` (listen for hotkey)

- [ ] **Step 13.1: Add globalShortcut plugin to Cargo**

In `desktop/src-tauri/Cargo.toml`:

```toml
tauri-plugin-global-shortcut = "2.0"
```

- [ ] **Step 13.2: Add capabilities file**

Create `desktop/src-tauri/capabilities/main.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2.0",
  "identifier": "main",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "global-shortcut:default",
    "shell:default",
    "dialog:default"
  ]
}
```

Add to `tauri.conf.json` under `app.security`:

```json
"capabilities": ["main"]
```

- [ ] **Step 13.3: Wire tray + hotkey in `lib.rs`**

```rust
// At top of run():
use tauri::{tray::TrayIconBuilder, menu::{Menu, MenuItem}, Manager, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState, Code, Modifiers};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = dotenvy::dotenv();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = app.emit("global-record-toggle", shortcut.to_string());
                    }
                })
                .build(),
        )
        .manage(AppState { session: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            cmds::login,
            cmds::logout,
            cmds::get_secrets,
            cmds::list_recent,
            cmds::register_recording,
            cmds::transcribe_recording,
        ])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show Utter", true, None::<&str>)?;
            let record = MenuItem::with_id(app, "record", "Start recording", true, Some("CmdOrCtrl+Shift+R"))?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&record, &show, &quit])?;
            let _ = TrayIconBuilder::new()
                .menu(&menu)
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, ev| match ev.id.as_ref() {
                    "show" => { if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); } }
                    "record" => { let _ = app.emit("global-record-toggle", "menu"); }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            let shortcut = Shortcut::new(Some(Modifiers::SHIFT | Modifiers::META), Code::KeyR);
            app.global_shortcut().register(shortcut)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 13.4: Listen for the event in the frontend**

In `desktop/src/App.tsx` add an `useEffect` that listens for `global-record-toggle`:

```tsx
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

// inside App component
useEffect(() => {
  const un = listen("global-record-toggle", () => {
    // simple toggle: if not recording, start with "both"; else stop is handled inside RecorderShell
    if (!recording) setRecording("both");
  });
  return () => { un.then((f) => f()); };
}, [recording]);
```

- [ ] **Step 13.5: Build and run**

```bash
pnpm --filter @utter/desktop tauri dev
```

Expected: tray icon appears, hotkey ⌘⇧R toggles recording. Stop with Ctrl-C.

- [ ] **Step 13.6: Commit**

```bash
git add desktop/src-tauri/Cargo.toml desktop/src-tauri/src/lib.rs desktop/src-tauri/tauri.conf.json desktop/src-tauri/capabilities desktop/src/App.tsx Cargo.lock
git commit -m "feat(desktop): tray menu + global hotkey to start recording"
```

---

## Task 14: .env.example + setup docs

**Files:**
- Create: `desktop/.env.example`
- Modify: `docs/setup.md` (append desktop section)

- [ ] **Step 14.1: Create `desktop/.env.example`**

```
# Same admin used by the web app
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me

# Mongo (shared with web)
MONGODB_URI=mongodb://localhost:27017/utter

# R2 (shared with web)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=utter

# Groq for transcription (desktop only)
GROQ_API_KEY=
```

- [ ] **Step 14.2: Append a "Desktop app" section to `docs/setup.md`**

```markdown
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
```

- [ ] **Step 14.3: Commit**

```bash
git add desktop/.env.example docs/setup.md
git commit -m "docs: desktop env example and run instructions"
```

---

## Task 15: Final spec coverage check

- [ ] **Step 15.1: Build everything**

```bash
pnpm install
pnpm --filter @utter/shared build
pnpm --filter @utter/web typecheck
pnpm --filter @utter/web test
pnpm --filter @utter/desktop typecheck
pnpm --filter @utter/desktop test
cd desktop/src-tauri && cargo build && cd ../..
```

Expected: all green.

- [ ] **Step 15.2: Manual end-to-end**

(With real R2 + Mongo + Groq.)

1. `pnpm --filter @utter/web dev` → leave running.
2. `pnpm --filter @utter/desktop tauri dev` → sign in.
3. Press the red button → pick a window → talk → click stop.
4. The web dashboard at `http://localhost:3000/` (after sign-in) shows the new recording with status `transcribing` then `ready`.
5. Open the recording → video plays from R2, transcript renders, ask Claude a question — citations seek the video.
6. Click "Create share link" → open the URL in incognito → public page shows video + transcript.

- [ ] **Step 15.3: Commit a final marker**

```bash
git commit --allow-empty -m "chore: utter desktop plan complete"
```

---

## Spec coverage summary

| Spec section | Tasks |
|---|---|
| Tauri 2 + React + Tailwind scaffold matching brand | 1 |
| `.env` loader, secrets bridge | 2, 5 |
| Admin login (constant-time compare) | 5, 7 |
| Window/tab/screen picker via getDisplayMedia | 8 |
| Mic + System mixing via Web Audio | 8 |
| MediaRecorder WebM + 5s chunks | 10 |
| R2 multipart streaming upload with retry | 9, 10 |
| MongoDB registration on stop | 5 |
| Groq Whisper transcription post-upload | 4, 5 |
| Floating recording pill + level meter | 12 |
| System tray + global hotkey | 13 |
| Setup docs (BlackHole, R2 CORS already in Plan A) | 14 |
| End-to-end smoke test | 15 |

The web side (admin dashboard, public share, Claude chat, signed playback URLs) lives in `2026-05-01-utter-web-and-shared.md`. With both plans executed, the spec is fully implemented.
