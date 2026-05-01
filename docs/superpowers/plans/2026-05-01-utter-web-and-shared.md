# Utter — Web App & Shared Infra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js admin dashboard, public share pages, Claude chat panel, MongoDB layer, and shared TypeScript types. The web app must be fully usable against seeded recordings before the desktop recorder exists.

**Architecture:** pnpm monorepo with `shared/` (TS types) and `web/` (Next.js 15 App Router). MongoDB Node driver invoked directly from server components and route handlers. `iron-session` for cookie auth gated by env-vars. `@anthropic-ai/sdk` for streaming Claude chat with prompt cache on the transcript block. `@aws-sdk/client-s3` to mint R2 signed playback URLs. Visual treatment matches `docs/design/preview.html` exactly.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, Tailwind CSS 4, MongoDB driver 6.x, iron-session 8, @anthropic-ai/sdk, @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner, nanoid, Vitest, mongodb-memory-server, Playwright. Fonts via `next/font/google` (Bricolage Grotesque, Geist, Geist Mono).

**Phases (checkpoint between):**
1. Tasks 1–6: Foundation (repo, types, web scaffold, brand tokens)
2. Tasks 7–10: Auth (session, login, middleware)
3. Tasks 11–16: Read paths (DB lib, recordings list, detail page, transcript)
4. Tasks 17–20: Sharing (token mint/revoke, public page)
5. Tasks 21–24: Claude chat (lib, streaming endpoint, panel UI, citations)
6. Tasks 25–28: Seed script, frontend-design polish, docs

---

## Task 1: Initialize monorepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Modify: `.gitignore`

- [ ] **Step 1.1: Create root `package.json`**

```json
{
  "name": "utter",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "engines": { "node": ">=20" },
  "packageManager": "pnpm@9.12.0"
}
```

- [ ] **Step 1.2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "shared"
  - "web"
  - "desktop"
```

- [ ] **Step 1.3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true
  }
}
```

- [ ] **Step 1.4: Create `.gitignore`**

```
node_modules
.next
dist
build
*.log
.env
.env.local
.env.*.local
.DS_Store
.vscode
.idea
coverage
.turbo
target
src-tauri/target
src-tauri/gen
```

- [ ] **Step 1.5: Verify pnpm is installed**

Run: `pnpm --version`
Expected: prints `9.12.0` or higher. If missing: `corepack enable && corepack prepare pnpm@9.12.0 --activate`

- [ ] **Step 1.6: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore
git commit -m "feat: initialize utter monorepo with pnpm workspaces"
```

---

## Task 2: Shared types package

**Files:**
- Create: `shared/package.json`
- Create: `shared/tsconfig.json`
- Create: `shared/src/index.ts`
- Create: `shared/src/index.test.ts`

- [ ] **Step 2.1: Create `shared/package.json`**

```json
{
  "name": "@utter/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 2.2: Create `shared/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 2.3: Create `shared/src/index.ts`**

```ts
export type RecordingStatus = "uploading" | "transcribing" | "ready" | "failed";

export interface TranscriptSegment {
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  end: number;
  text: string;
}

export interface Transcript {
  segments: TranscriptSegment[];
  fullText: string;
  language: string;
  model: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string; // ISO-8601
}

export interface Recording {
  id: string; // hex string of ObjectId
  title: string;
  createdAt: string; // ISO-8601
  durationMs: number;
  sizeBytes: number;
  status: RecordingStatus;
  r2Key: string;
  r2Bucket: string;
  mimeType: "video/webm";
  transcript: Transcript | null;
  chats: ChatMessage[];
  shareToken: string | null;
  failureReason: string | null;
}

/** Format seconds as HH:MM:SS for display. */
export function formatTime(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

/** Parse "HH:MM:SS" or "MM:SS" back to seconds. Returns null on garbage input. */
export function parseTime(s: string): number | null {
  const parts = s.split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return null;
}
```

- [ ] **Step 2.4: Create `shared/src/index.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { formatTime, parseTime } from "./index.js";

describe("formatTime", () => {
  it("pads to HH:MM:SS", () => {
    expect(formatTime(0)).toBe("00:00:00");
    expect(formatTime(9)).toBe("00:00:09");
    expect(formatTime(75)).toBe("00:01:15");
    expect(formatTime(3661)).toBe("01:01:01");
  });
  it("floors fractional seconds", () => {
    expect(formatTime(9.9)).toBe("00:00:09");
  });
});

describe("parseTime", () => {
  it("parses HH:MM:SS", () => {
    expect(parseTime("01:01:01")).toBe(3661);
  });
  it("parses MM:SS", () => {
    expect(parseTime("01:15")).toBe(75);
  });
  it("returns null for garbage", () => {
    expect(parseTime("nope")).toBeNull();
    expect(parseTime("")).toBeNull();
  });
  it("round-trips with formatTime", () => {
    for (const s of [0, 7, 65, 3725]) expect(parseTime(formatTime(s))).toBe(s);
  });
});
```

- [ ] **Step 2.5: Install and run**

Run from repo root:
```bash
pnpm install
pnpm --filter @utter/shared test
```
Expected: 4 passing tests.

- [ ] **Step 2.6: Build**

```bash
pnpm --filter @utter/shared build
ls shared/dist
```
Expected: `index.d.ts`, `index.d.ts.map`, `index.js`.

- [ ] **Step 2.7: Commit**

```bash
git add shared package.json pnpm-lock.yaml
git commit -m "feat(shared): add Recording types and time helpers"
```

---

## Task 3: Next.js scaffold

**Files:**
- Create: `web/package.json`
- Create: `web/next.config.ts`
- Create: `web/tsconfig.json`
- Create: `web/postcss.config.mjs`
- Create: `web/tailwind.config.ts`
- Create: `web/app/layout.tsx`
- Create: `web/app/page.tsx`
- Create: `web/app/globals.css`
- Create: `web/.env.example`
- Create: `web/vitest.config.ts`
- Create: `web/next-env.d.ts`

- [ ] **Step 3.1: Create `web/package.json`**

```json
{
  "name": "@utter/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "next lint"
  },
  "dependencies": {
    "@utter/shared": "workspace:*",
    "@anthropic-ai/sdk": "^0.32.1",
    "@aws-sdk/client-s3": "^3.689.0",
    "@aws-sdk/s3-request-presigner": "^3.689.0",
    "iron-session": "^8.0.4",
    "mongodb": "^6.10.0",
    "nanoid": "^5.0.8",
    "next": "15.0.3",
    "react": "19.0.0-rc-66855b96-20241106",
    "react-dom": "19.0.0-rc-66855b96-20241106"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.2",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@types/node": "^22.9.0",
    "@types/react": "npm:types-react@rc",
    "@types/react-dom": "npm:types-react-dom@rc",
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "happy-dom": "^15.11.0",
    "mongodb-memory-server": "^10.1.2",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

(We pin React 19 RC because Next 15 ships against it.)

- [ ] **Step 3.2: Create `web/next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  transpilePackages: ["@utter/shared"],
};

export default nextConfig;
```

- [ ] **Step 3.3: Create `web/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] },
    "noEmit": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3.4: Create `web/postcss.config.mjs`**

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 3.5: Create `web/tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
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

- [ ] **Step 3.6: Create `web/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --grain-opacity: 0.035;
  }
  html, body {
    background: theme('colors.bg.0');
    color: theme('colors.text.0');
    font-family: var(--font-sans);
    font-feature-settings: "ss01", "ss02";
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  body::before {
    content: "";
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(ellipse at 50% -10%, rgba(79,138,247,.06), transparent 60%),
      radial-gradient(ellipse at 80% 110%, rgba(79,138,247,.04), transparent 50%);
  }
  body::after {
    content: "";
    position: fixed; inset: 0; pointer-events: none; z-index: 1;
    mix-blend-mode: overlay;
    opacity: 0.7;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .035 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: theme('colors.line.2'); border-radius: 9999px; }
}

@layer utilities {
  .surface-app { position: relative; z-index: 2; }
  .grain-off::after { display: none; }
}
```

- [ ] **Step 3.7: Create `web/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Utter",
  description: "Quiet meeting recorder.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <div className="surface-app">{children}</div>
      </body>
    </html>
  );
}
```

- [ ] **Step 3.8: Create `web/app/page.tsx`**

```tsx
export default function Home() {
  return (
    <main className="p-16 max-w-4xl mx-auto">
      <h1 className="font-display text-6xl tracking-tightest font-bold">Utter.</h1>
      <p className="text-text-1 mt-2">Scaffold ready.</p>
    </main>
  );
}
```

- [ ] **Step 3.9: Create `web/.env.example`**

```
# Admin auth (single user)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me

# 32+ char random; used to sign session cookie
SESSION_SECRET=change-me-to-a-long-random-string-please-32

# MongoDB (shared with desktop app)
MONGODB_URI=mongodb://localhost:27017/utter

# R2 (shared with desktop app). For S3 SDK: endpoint = https://<accountId>.r2.cloudflarestorage.com
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=utter

# Anthropic
ANTHROPIC_API_KEY=
```

- [ ] **Step 3.10: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

- [ ] **Step 3.11: Create `web/vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3.12: Create `web/next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 3.13: Install + verify dev server starts**

```bash
pnpm install
pnpm --filter @utter/web dev
```
Expected: Next.js boots on `http://localhost:3000`. Visit it in a browser; the page shows "Utter." with the Bricolage display font and the body grain/gradient is subtly visible.

Stop the dev server (Ctrl-C).

- [ ] **Step 3.14: Commit**

```bash
git add web/ pnpm-lock.yaml
git commit -m "feat(web): scaffold next.js 15 app with tailwind + brand tokens"
```

---

## Task 4: Logo, primitives, and brand atoms

**Files:**
- Create: `web/components/Logo.tsx`
- Create: `web/components/MonoTime.tsx`
- Create: `web/components/Tag.tsx`
- Create: `web/components/Button.tsx`
- Create: `web/components/Kbd.tsx`
- Create: `web/components/SectionLabel.tsx`
- Create: `web/components/__tests__/Tag.test.tsx`

- [ ] **Step 4.1: Create `web/components/Logo.tsx`**

```tsx
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-md bg-accent text-white font-display font-bold leading-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1),0_4px_12px_rgba(79,138,247,0.3)]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55), letterSpacing: "-0.04em" }}
      aria-hidden
    >
      U
    </span>
  );
}
```

- [ ] **Step 4.2: Create `web/components/MonoTime.tsx`**

```tsx
import { formatTime } from "@utter/shared";

export function MonoTime({ seconds, className = "" }: { seconds: number; className?: string }) {
  return (
    <span className={`font-mono tabular-nums tracking-wide ${className}`}>{formatTime(seconds)}</span>
  );
}
```

- [ ] **Step 4.3: Create `web/components/Tag.tsx`**

```tsx
import type { RecordingStatus } from "@utter/shared";

const STYLES: Record<RecordingStatus | "shared", { color: string; border: string; bg: string; label: string; pulse?: boolean }> = {
  ready:        { color: "text-ok",     border: "border-ok/30",     bg: "bg-ok/[0.06]",     label: "Ready" },
  uploading:    { color: "text-warn",   border: "border-warn/30",   bg: "bg-warn/[0.06]",   label: "Uploading", pulse: true },
  transcribing: { color: "text-accent", border: "border-accent/30", bg: "bg-accent/[0.06]", label: "Transcribing", pulse: true },
  failed:       { color: "text-rec",    border: "border-rec/30",    bg: "bg-rec/[0.06]",    label: "Failed" },
  shared:       { color: "text-accent", border: "border-accent/30", bg: "bg-accent/[0.06]", label: "Shared" },
};

export function Tag({ kind, label }: { kind: keyof typeof STYLES; label?: string }) {
  const s = STYLES[kind];
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2 py-[3px] rounded-full border ${s.color} ${s.border} ${s.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full bg-current ${s.pulse ? "animate-[blink_1.4s_ease-in-out_infinite]" : ""}`} />
      {label ?? s.label}
    </span>
  );
}
```

- [ ] **Step 4.4: Add the `blink` keyframe to globals**

Edit `web/app/globals.css` and append inside `@layer base`:

```css
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}
@keyframes pulse-rec {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}
```

- [ ] **Step 4.5: Create `web/components/Button.tsx`**

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

- [ ] **Step 4.6: Create `web/components/Kbd.tsx`**

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

- [ ] **Step 4.7: Create `web/components/SectionLabel.tsx`**

```tsx
import type { ReactNode } from "react";
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-widest text-text-2">
      <span className="block w-6 h-px bg-line-2" />
      {children}
    </span>
  );
}
```

- [ ] **Step 4.8: Create `web/components/__tests__/Tag.test.tsx`**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tag } from "../Tag";

describe("Tag", () => {
  it("renders the default label for each kind", () => {
    render(<Tag kind="ready" />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });
  it("uses an override label when provided", () => {
    render(<Tag kind="uploading" label="Upload 64%" />);
    expect(screen.getByText("Upload 64%")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4.9: Run tests**

```bash
pnpm --filter @utter/web test
```
Expected: 2 passing.

- [ ] **Step 4.10: Commit**

```bash
git add web/components web/app/globals.css
git commit -m "feat(web): add brand atoms (Logo, Tag, Button, MonoTime, Kbd, SectionLabel)"
```

---

## Task 5: MongoDB connection lib

**Files:**
- Create: `web/lib/db.ts`
- Create: `web/lib/__tests__/db.test.ts`

- [ ] **Step 5.1: Write the failing test**

Create `web/lib/__tests__/db.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { getDb, getRecordingsCollection, ensureIndexes, _resetForTests } from "../db";

let mem: MongoMemoryServer;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri("utter-test");
  _resetForTests();
});

afterAll(async () => {
  _resetForTests();
  await mem.stop();
});

describe("db", () => {
  it("connects and returns a singleton client", async () => {
    const a = await getDb();
    const b = await getDb();
    expect(a).toBe(b);
  });
  it("exposes the recordings collection", async () => {
    const col = await getRecordingsCollection();
    expect(col.collectionName).toBe("recordings");
  });
  it("ensures the expected indexes", async () => {
    await ensureIndexes();
    const col = await getRecordingsCollection();
    const idx = await col.indexes();
    const names = idx.map((i) => i.name).sort();
    expect(names).toContain("createdAt_-1");
    expect(names).toContain("shareToken_1");
  });
});
```

- [ ] **Step 5.2: Run test (expected to fail)**

```bash
pnpm --filter @utter/web test lib/__tests__/db.test.ts
```
Expected: FAIL with "Cannot find module '../db'".

- [ ] **Step 5.3: Implement `web/lib/db.ts`**

```ts
import { MongoClient, type Db, type Collection } from "mongodb";
import type { Recording } from "@utter/shared";

type RecordingDoc = Omit<Recording, "id" | "createdAt" | "transcript" | "chats"> & {
  createdAt: Date;
  transcript: Recording["transcript"] extends infer T ? T : never;
  chats: Array<{ role: "user" | "assistant"; content: string; createdAt: Date }>;
};
export type { RecordingDoc };

let clientPromise: Promise<MongoClient> | null = null;

function getClient(): Promise<MongoClient> {
  if (clientPromise) return clientPromise;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  const client = new MongoClient(uri, { maxPoolSize: 10 });
  clientPromise = client.connect();
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const c = await getClient();
  return c.db(); // db name comes from URI
}

export async function getRecordingsCollection(): Promise<Collection<RecordingDoc>> {
  const db = await getDb();
  return db.collection<RecordingDoc>("recordings");
}

export async function ensureIndexes(): Promise<void> {
  const col = await getRecordingsCollection();
  await col.createIndex({ createdAt: -1 }, { name: "createdAt_-1" });
  await col.createIndex({ shareToken: 1 }, { name: "shareToken_1", unique: true, sparse: true });
}

/** Reset the cached client. Tests only. */
export function _resetForTests(): void {
  clientPromise = null;
}
```

- [ ] **Step 5.4: Run test (expected to pass)**

```bash
pnpm --filter @utter/web test lib/__tests__/db.test.ts
```
Expected: 3 passing.

- [ ] **Step 5.5: Commit**

```bash
git add web/lib/db.ts web/lib/__tests__/db.test.ts
git commit -m "feat(web): add cached MongoDB connection with index ensure"
```

---

## Task 6: Recordings repository

**Files:**
- Create: `web/lib/recordings.ts`
- Create: `web/lib/__tests__/recordings.test.ts`

- [ ] **Step 6.1: Write the failing test**

Create `web/lib/__tests__/recordings.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { getRecordingsCollection, _resetForTests, ensureIndexes } from "../db";
import { listRecordings, getRecording, getRecordingByShareToken, mintShareToken, revokeShareToken, appendChatTurn } from "../recordings";

let mem: MongoMemoryServer;

beforeAll(async () => {
  mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri("utter-test");
  _resetForTests();
  await ensureIndexes();
});

afterAll(async () => {
  _resetForTests();
  await mem.stop();
});

beforeEach(async () => {
  const col = await getRecordingsCollection();
  await col.deleteMany({});
});

async function seedOne(title: string, when: Date) {
  const col = await getRecordingsCollection();
  const r = await col.insertOne({
    title,
    createdAt: when,
    durationMs: 60_000,
    sizeBytes: 1024,
    status: "ready",
    r2Key: "k",
    r2Bucket: "b",
    mimeType: "video/webm",
    transcript: { segments: [{ start: 0, end: 1, text: "hi" }], fullText: "hi", language: "en", model: "whisper-large-v3" },
    chats: [],
    shareToken: null,
    failureReason: null,
  });
  return r.insertedId.toHexString();
}

describe("recordings repo", () => {
  it("lists in reverse chronological order", async () => {
    await seedOne("a", new Date("2026-01-01"));
    await seedOne("b", new Date("2026-02-01"));
    const all = await listRecordings();
    expect(all.map((r) => r.title)).toEqual(["b", "a"]);
  });

  it("getRecording returns a single record by id with ISO dates", async () => {
    const id = await seedOne("a", new Date("2026-01-01"));
    const got = await getRecording(id);
    expect(got?.title).toBe("a");
    expect(got?.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("returns null for unknown id", async () => {
    expect(await getRecording("000000000000000000000000")).toBeNull();
  });

  it("mints a share token, finds by token, and revokes", async () => {
    const id = await seedOne("a", new Date());
    const token = await mintShareToken(id);
    expect(token).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const found = await getRecordingByShareToken(token);
    expect(found?.id).toBe(id);
    await revokeShareToken(id);
    expect(await getRecordingByShareToken(token)).toBeNull();
  });

  it("appends chat turns", async () => {
    const id = await seedOne("a", new Date());
    await appendChatTurn(id, { role: "user", content: "What was decided?" });
    await appendChatTurn(id, { role: "assistant", content: "Many things [00:01:00]." });
    const got = await getRecording(id);
    expect(got!.chats).toHaveLength(2);
    expect(got!.chats[0]!.role).toBe("user");
    expect(typeof got!.chats[0]!.createdAt).toBe("string");
  });
});
```

- [ ] **Step 6.2: Run test (expected to fail — module missing)**

```bash
pnpm --filter @utter/web test lib/__tests__/recordings.test.ts
```
Expected: FAIL.

- [ ] **Step 6.3: Implement `web/lib/recordings.ts`**

```ts
import { ObjectId } from "mongodb";
import { customAlphabet } from "nanoid";
import type { ChatMessage, Recording } from "@utter/shared";
import { getRecordingsCollection, type RecordingDoc } from "./db";

const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const newToken = customAlphabet(TOKEN_ALPHABET, 16);

function toRecording(doc: RecordingDoc & { _id: ObjectId }): Recording {
  return {
    id: doc._id.toHexString(),
    title: doc.title,
    createdAt: doc.createdAt.toISOString(),
    durationMs: doc.durationMs,
    sizeBytes: doc.sizeBytes,
    status: doc.status,
    r2Key: doc.r2Key,
    r2Bucket: doc.r2Bucket,
    mimeType: doc.mimeType,
    transcript: doc.transcript,
    chats: doc.chats.map((c) => ({ role: c.role, content: c.content, createdAt: c.createdAt.toISOString() })),
    shareToken: doc.shareToken,
    failureReason: doc.failureReason,
  };
}

export async function listRecordings(): Promise<Recording[]> {
  const col = await getRecordingsCollection();
  const docs = await col.find({}).sort({ createdAt: -1 }).limit(200).toArray();
  return docs.map((d) => toRecording(d as RecordingDoc & { _id: ObjectId }));
}

export async function getRecording(id: string): Promise<Recording | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await getRecordingsCollection();
  const doc = await col.findOne({ _id: new ObjectId(id) });
  return doc ? toRecording(doc as RecordingDoc & { _id: ObjectId }) : null;
}

export async function getRecordingByShareToken(token: string): Promise<Recording | null> {
  const col = await getRecordingsCollection();
  const doc = await col.findOne({ shareToken: token });
  return doc ? toRecording(doc as RecordingDoc & { _id: ObjectId }) : null;
}

export async function mintShareToken(id: string): Promise<string> {
  if (!ObjectId.isValid(id)) throw new Error("Invalid id");
  const col = await getRecordingsCollection();
  const token = newToken();
  await col.updateOne({ _id: new ObjectId(id) }, { $set: { shareToken: token } });
  return token;
}

export async function revokeShareToken(id: string): Promise<void> {
  if (!ObjectId.isValid(id)) throw new Error("Invalid id");
  const col = await getRecordingsCollection();
  await col.updateOne({ _id: new ObjectId(id) }, { $set: { shareToken: null } });
}

export async function appendChatTurn(id: string, turn: Omit<ChatMessage, "createdAt">): Promise<void> {
  if (!ObjectId.isValid(id)) throw new Error("Invalid id");
  const col = await getRecordingsCollection();
  await col.updateOne(
    { _id: new ObjectId(id) },
    { $push: { chats: { role: turn.role, content: turn.content, createdAt: new Date() } } }
  );
}
```

- [ ] **Step 6.4: Run tests**

```bash
pnpm --filter @utter/web test lib/__tests__/recordings.test.ts
```
Expected: 5 passing.

- [ ] **Step 6.5: Commit**

```bash
git add web/lib/recordings.ts web/lib/__tests__/recordings.test.ts
git commit -m "feat(web): add recordings repository with share token mint/revoke"
```

---

## Task 7: Auth lib (session + password compare)

**Files:**
- Create: `web/lib/auth.ts`
- Create: `web/lib/__tests__/auth.test.ts`

- [ ] **Step 7.1: Write the failing test**

```ts
// web/lib/__tests__/auth.test.ts
import { describe, expect, it } from "vitest";
import { verifyAdminCredentials } from "../auth";

describe("verifyAdminCredentials", () => {
  it("accepts the configured username/password", () => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "hunter2";
    expect(verifyAdminCredentials("admin", "hunter2")).toBe(true);
  });
  it("rejects wrong password", () => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "hunter2";
    expect(verifyAdminCredentials("admin", "nope")).toBe(false);
  });
  it("rejects wrong username", () => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "hunter2";
    expect(verifyAdminCredentials("attacker", "hunter2")).toBe(false);
  });
  it("rejects when env not set", () => {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    expect(verifyAdminCredentials("admin", "hunter2")).toBe(false);
  });
  it("uses constant-time comparison (no early-return on length mismatch)", () => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "abcdef";
    expect(verifyAdminCredentials("admin", "abc")).toBe(false);
    expect(verifyAdminCredentials("admin", "abcdefghi")).toBe(false);
  });
});
```

- [ ] **Step 7.2: Run test (fails)**

```bash
pnpm --filter @utter/web test lib/__tests__/auth.test.ts
```
Expected: FAIL.

- [ ] **Step 7.3: Implement `web/lib/auth.ts`**

```ts
import { timingSafeEqual } from "node:crypto";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  isAdmin?: true;
  loggedInAt?: string; // ISO
}

export function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 chars");
  }
  return {
    cookieName: "utter_session",
    password,
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
  };
}

export async function getSession() {
  const c = await cookies();
  return getIronSession<SessionData>(c, sessionOptions());
}

function timingSafeStringEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // Always do a compare on equal-length buffers to avoid early return,
  // but length mismatch still means "not equal".
  const max = Math.max(ab.length, bb.length, 1);
  const ap = Buffer.alloc(max);
  const bp = Buffer.alloc(max);
  ab.copy(ap);
  bb.copy(bp);
  const equalLength = ab.length === bb.length;
  return timingSafeEqual(ap, bp) && equalLength;
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  const u = process.env.ADMIN_USERNAME;
  const p = process.env.ADMIN_PASSWORD;
  if (!u || !p) return false;
  const userOk = timingSafeStringEq(username, u);
  const passOk = timingSafeStringEq(password, p);
  return userOk && passOk;
}
```

- [ ] **Step 7.4: Run tests**

```bash
pnpm --filter @utter/web test lib/__tests__/auth.test.ts
```
Expected: 5 passing.

- [ ] **Step 7.5: Commit**

```bash
git add web/lib/auth.ts web/lib/__tests__/auth.test.ts
git commit -m "feat(web): add iron-session config and constant-time admin compare"
```

---

## Task 8: Login page + API + middleware

**Files:**
- Create: `web/app/login/page.tsx`
- Create: `web/app/api/auth/login/route.ts`
- Create: `web/app/api/auth/logout/route.ts`
- Create: `web/middleware.ts`

- [ ] **Step 8.1: Create `web/app/api/auth/login/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getSession, verifyAdminCredentials } from "@/lib/auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { username?: string; password?: string } | null;
  if (!body?.username || !body?.password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }
  if (!verifyAdminCredentials(body.username, body.password)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const session = await getSession();
  session.isAdmin = true;
  session.loggedInAt = new Date().toISOString();
  await session.save();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 8.2: Create `web/app/api/auth/logout/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function POST() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 8.3: Create `web/app/login/page.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { Kbd } from "@/components/Kbd";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u, password: p }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => null))?.error ?? "Login failed");
      return;
    }
    router.replace(next);
  }

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-bg-1 border border-line-1 rounded-lg p-8 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-2.5 mb-7">
          <Logo />
          <span className="font-display font-semibold text-lg tracking-tighter">Utter</span>
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tighter mb-1">Welcome back.</h1>
        <p className="text-text-1 text-sm mb-6">Admin sign-in.</p>

        <label className="block mb-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-2 mb-1.5 block">Username</span>
          <input
            value={u} onChange={(e) => setU(e.target.value)} autoFocus required
            className="w-full bg-bg-2 border border-line-1 focus:border-line-2 outline-none rounded px-3 py-2 text-sm"
          />
        </label>
        <label className="block mb-5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-2 mb-1.5 block">Password</span>
          <input
            type="password" value={p} onChange={(e) => setP(e.target.value)} required
            className="w-full bg-bg-2 border border-line-1 focus:border-line-2 outline-none rounded px-3 py-2 text-sm"
          />
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

- [ ] **Step 8.4: Create `web/middleware.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";

const PUBLIC_PREFIXES = ["/login", "/share", "/api/auth/login", "/api/share", "/_next", "/favicon"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const res = NextResponse.next();
  const session = await getIronSession<{ isAdmin?: true }>(req, res, {
    cookieName: "utter_session",
    password,
  });

  if (!session.isAdmin) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: [
    // Run on everything except Next assets and static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
```

- [ ] **Step 8.5: Manual verification**

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=hunter2 \
SESSION_SECRET=this_is_a_test_secret_at_least_32_chars_long \
MONGODB_URI=mongodb://localhost:27017/utter \
pnpm --filter @utter/web dev
```

Visit `http://localhost:3000/`. Expected: redirect to `/login?next=%2F`. Submit wrong password → error message. Submit correct → redirected to `/`. Stop the server.

(If you don't have MongoDB running locally, skip the manual step and rely on tests; the unauth path doesn't touch Mongo.)

- [ ] **Step 8.6: Commit**

```bash
git add web/app/login web/app/api/auth web/middleware.ts
git commit -m "feat(web): admin login page, session API, and middleware gate"
```

---

## Task 9: Recordings list API + dashboard page

**Files:**
- Create: `web/app/api/recordings/route.ts`
- Create: `web/components/Sidebar.tsx`
- Create: `web/components/RecordingsTable.tsx`
- Create: `web/app/page.tsx` (overwrite scaffold)
- Create: `web/lib/format.ts`

- [ ] **Step 9.1: Create `web/lib/format.ts`**

```ts
export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const day = d.getDate();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${month} ${day} · ${time}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
```

- [ ] **Step 9.2: Create `web/app/api/recordings/route.ts`**

```ts
import { NextResponse } from "next/server";
import { listRecordings } from "@/lib/recordings";

export async function GET() {
  const recs = await listRecordings();
  return NextResponse.json({ recordings: recs });
}
```

- [ ] **Step 9.3: Create `web/components/Sidebar.tsx`**

```tsx
import Link from "next/link";
import { Logo } from "./Logo";

export function Sidebar({ active }: { active: "recordings" | "shared" | "settings" }) {
  return (
    <aside className="w-[220px] shrink-0 border-r border-line-1 bg-black/[0.12] flex flex-col">
      <div className="px-6 pt-6 pb-7 flex items-center gap-2.5">
        <Logo />
        <span className="font-display font-semibold text-lg tracking-tighter">Utter</span>
      </div>
      <nav className="flex flex-col">
        <NavItem href="/" label="Recordings" active={active === "recordings"} />
        <NavItem href="/shared" label="Shared" active={active === "shared"} />
        <NavItem href="/settings" label="Settings" active={active === "settings"} />
      </nav>
      <div className="mt-auto px-6 py-5 border-t border-line-1 font-mono text-[10px] uppercase tracking-wider text-text-2">
        <div className="flex justify-between mb-1.5">
          <span>R2</span><span className="text-ok">● Online</span>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  const cls = active
    ? "text-text-0 border-accent bg-gradient-to-r from-accent/[0.12] to-transparent"
    : "text-text-1 border-transparent hover:text-text-0 hover:bg-white/[0.02]";
  return (
    <Link href={href as any} className={`px-6 py-2 text-[13.5px] border-l-2 ${cls}`}>{label}</Link>
  );
}
```

- [ ] **Step 9.4: Create `web/components/RecordingsTable.tsx`**

```tsx
import Link from "next/link";
import type { Recording } from "@utter/shared";
import { Tag } from "./Tag";
import { formatDate, formatDuration } from "@/lib/format";

const HEAD_CLS = "px-5 py-3 font-mono text-[10px] uppercase tracking-wider text-text-2 bg-black/[0.18]";

export function RecordingsTable({ recordings }: { recordings: Recording[] }) {
  return (
    <div className="border border-line-1 rounded-lg overflow-hidden bg-bg-1">
      <div className="grid grid-cols-[1fr_100px_140px_220px_60px] gap-6 border-b border-line-1">
        <div className={HEAD_CLS}>Recording</div>
        <div className={HEAD_CLS}>Length</div>
        <div className={HEAD_CLS}>Status</div>
        <div className={HEAD_CLS}>Share</div>
        <div className={HEAD_CLS}></div>
      </div>
      {recordings.length === 0 && (
        <div className="px-5 py-10 text-center text-text-2 text-sm">No recordings yet.</div>
      )}
      {recordings.map((r) => (
        <Link key={r.id} href={`/r/${r.id}` as any}
              className="grid grid-cols-[1fr_100px_140px_220px_60px] gap-6 px-5 py-4 items-center border-b border-line-1 last:border-b-0 hover:bg-bg-2 transition-colors">
          <div className="flex items-center gap-3">
            <Thumb />
            <div>
              <div className="text-sm font-medium">{r.title}</div>
              <div className="font-mono text-[10.5px] text-text-2 tracking-wide mt-0.5">{formatDate(r.createdAt)}</div>
            </div>
          </div>
          <div className="font-mono text-xs text-text-1 tabular-nums tracking-wide">
            {formatDuration(r.durationMs)}
          </div>
          <div>{statusTag(r)}</div>
          <div className={`font-mono text-[11.5px] tracking-wide ${r.shareToken ? "text-accent" : "text-text-2"}`}>
            {r.shareToken ? `utter.app/s/${r.shareToken}` : "—"}
          </div>
          <div className="text-right font-mono text-xs text-text-1">→</div>
        </Link>
      ))}
    </div>
  );
}

function Thumb() {
  return (
    <div className="w-11 h-7 rounded-sm border border-line-1 bg-gradient-to-br from-bg-3 to-bg-1 relative shrink-0">
      <span className="absolute left-[38%] top-1/2 -translate-y-1/2 border-l-[6px] border-l-text-1 border-y-[4px] border-y-transparent" />
    </div>
  );
}

function statusTag(r: Recording) {
  if (r.status === "ready") return <Tag kind="ready" />;
  if (r.status === "transcribing") return <Tag kind="transcribing" />;
  if (r.status === "failed") return <Tag kind="failed" />;
  return <Tag kind="uploading" />;
}
```

- [ ] **Step 9.5: Replace `web/app/page.tsx`**

```tsx
import { Sidebar } from "@/components/Sidebar";
import { RecordingsTable } from "@/components/RecordingsTable";
import { listRecordings } from "@/lib/recordings";
import { formatDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const recordings = await listRecordings();
  const totalMs = recordings.reduce((acc, r) => acc + r.durationMs, 0);
  return (
    <div className="grid grid-cols-[220px_1fr] min-h-screen">
      <Sidebar active="recordings" />
      <main className="px-10 py-8">
        <header className="flex items-end justify-between mb-7">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-text-2 mb-1">
              {recordings.length} recordings · {formatDuration(totalMs)} total
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tighter">Recordings</h1>
          </div>
        </header>
        <RecordingsTable recordings={recordings} />
      </main>
    </div>
  );
}
```

- [ ] **Step 9.6: Manual smoke test**

Same env as Task 8 step 5; dev server up; you'll need at least one recording in Mongo. Skip until Task 22 introduces the seed script — for now, an empty list is fine. Visit `/` after logging in. Expected: page renders with "No recordings yet." Stop server.

- [ ] **Step 9.7: Commit**

```bash
git add web/app/api/recordings web/app/page.tsx web/components/Sidebar.tsx web/components/RecordingsTable.tsx web/lib/format.ts
git commit -m "feat(web): dashboard list page and /api/recordings"
```

---

## Task 10: R2 signed URL lib

**Files:**
- Create: `web/lib/r2.ts`
- Create: `web/lib/__tests__/r2.test.ts`

- [ ] **Step 10.1: Write the failing test**

```ts
// web/lib/__tests__/r2.test.ts
import { describe, expect, it, beforeEach, vi } from "vitest";

beforeEach(() => {
  process.env.R2_ACCOUNT_ID = "abc";
  process.env.R2_ACCESS_KEY_ID = "key";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  process.env.R2_BUCKET = "utter";
  vi.resetModules();
});

describe("getSignedPlaybackUrl", () => {
  it("returns an https URL with X-Amz-Signature query", async () => {
    const { getSignedPlaybackUrl } = await import("../r2");
    const url = await getSignedPlaybackUrl("recordings/foo.webm");
    expect(url.startsWith("https://")).toBe(true);
    expect(url).toMatch(/X-Amz-Signature=/);
    expect(url).toMatch(/recordings\/foo\.webm/);
  });
});
```

- [ ] **Step 10.2: Run test (fails)**

Expected: FAIL.

- [ ] **Step 10.3: Implement `web/lib/r2.ts`**

```ts
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let cached: S3Client | null = null;

export function getR2Client(): S3Client {
  if (cached) return cached;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error("R2 credentials are not configured");
  cached = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cached;
}

export async function getSignedPlaybackUrl(key: string, ttlSec = 60 * 60 * 6): Promise<string> {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error("R2_BUCKET is not set");
  const client = getR2Client();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttlSec });
}
```

- [ ] **Step 10.4: Run test**

Expected: 1 passing.

- [ ] **Step 10.5: Commit**

```bash
git add web/lib/r2.ts web/lib/__tests__/r2.test.ts
git commit -m "feat(web): R2 signed playback URL helper"
```

---

## Task 11: Recording detail API + signed URL endpoint

**Files:**
- Create: `web/app/api/recordings/[id]/route.ts`
- Create: `web/app/api/recordings/[id]/url/route.ts`

- [ ] **Step 11.1: Create `web/app/api/recordings/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getRecording } from "@/lib/recordings";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getRecording(id);
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ recording: rec });
}
```

- [ ] **Step 11.2: Create `web/app/api/recordings/[id]/url/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getRecording } from "@/lib/recordings";
import { getSignedPlaybackUrl } from "@/lib/r2";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getRecording(id);
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = await getSignedPlaybackUrl(rec.r2Key);
  return NextResponse.json({ url, expiresAt: new Date(Date.now() + 6 * 3600 * 1000).toISOString() });
}
```

- [ ] **Step 11.3: Commit**

```bash
git add web/app/api/recordings
git commit -m "feat(web): recording detail and signed URL endpoints"
```

---

## Task 12: Transcript components (synced to video)

**Files:**
- Create: `web/components/TranscriptList.tsx`
- Create: `web/components/VideoPlayer.tsx`
- Create: `web/components/__tests__/TranscriptList.test.tsx`

- [ ] **Step 12.1: Write the failing test**

```tsx
// web/components/__tests__/TranscriptList.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TranscriptList } from "../TranscriptList";

const segs = [
  { start: 0, end: 5, text: "Hello." },
  { start: 5, end: 10, text: "World." },
];

describe("TranscriptList", () => {
  it("highlights the active segment based on currentTime", () => {
    render(<TranscriptList segments={segs} currentTime={6} onSeek={() => {}} />);
    const active = screen.getByText("World.").closest("[data-seg]")!;
    expect(active).toHaveAttribute("data-active", "true");
  });
  it("calls onSeek with the segment start when a row is clicked", () => {
    const onSeek = vi.fn();
    render(<TranscriptList segments={segs} currentTime={0} onSeek={onSeek} />);
    fireEvent.click(screen.getByText("World."));
    expect(onSeek).toHaveBeenCalledWith(5);
  });
});
```

- [ ] **Step 12.2: Run test (fails)**

Expected: FAIL.

- [ ] **Step 12.3: Implement `web/components/TranscriptList.tsx`**

```tsx
"use client";
import { formatTime, type TranscriptSegment } from "@utter/shared";
import { useEffect, useRef } from "react";

export function TranscriptList({
  segments,
  currentTime,
  onSeek,
  className = "",
}: {
  segments: TranscriptSegment[];
  currentTime: number;
  onSeek: (seconds: number) => void;
  className?: string;
}) {
  const activeIdx = segments.findIndex((s) => currentTime >= s.start && currentTime < s.end);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx]);

  return (
    <div className={`border border-line-1 bg-bg-1 rounded-lg flex flex-col h-[320px] overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-line-1 font-mono text-[10.5px] uppercase tracking-wider text-text-2">
        <span>Transcript · {segments.length} segments</span>
      </div>
      <div ref={containerRef} className="overflow-y-auto py-2 flex-1">
        {segments.map((s, i) => {
          const active = i === activeIdx;
          return (
            <button
              type="button"
              key={i}
              data-seg
              data-active={active}
              onClick={() => onSeek(s.start)}
              className={`w-full text-left grid grid-cols-[64px_1fr] gap-4 px-4 py-2 cursor-pointer transition-colors border-l-2 ${
                active
                  ? "bg-gradient-to-r from-accent/[0.12] to-transparent border-accent"
                  : "border-transparent hover:bg-white/[0.02]"
              }`}
            >
              <span className={`font-mono text-[11px] tracking-wide tabular-nums pt-0.5 ${active ? "text-accent" : "text-text-2"}`}>
                {formatTime(s.start)}
              </span>
              <span className={`text-[13.5px] leading-[1.55] ${active ? "text-text-0" : "text-text-1"}`}>{s.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 12.4: Implement `web/components/VideoPlayer.tsx`**

```tsx
"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface VideoPlayerHandle {
  seekTo(seconds: number): void;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, {
  src: string;
  onTimeUpdate?: (s: number) => void;
}>(function VideoPlayer({ src, onTimeUpdate }, ref) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [errored, setErrored] = useState(false);

  useImperativeHandle(ref, () => ({
    seekTo(seconds: number) {
      const v = videoRef.current; if (!v) return;
      v.currentTime = seconds;
      v.play().catch(() => {});
    },
  }), []);

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    function onTime() { onTimeUpdate?.(v!.currentTime); }
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [onTimeUpdate]);

  return (
    <div className="aspect-video border border-line-1 rounded-lg overflow-hidden relative bg-gradient-to-br from-bg-3 to-bg-1">
      {errored ? (
        <div className="absolute inset-0 grid place-items-center text-text-1 text-sm">Failed to load video.</div>
      ) : (
        <video
          ref={videoRef}
          src={src}
          className="w-full h-full"
          controls
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
});
```

- [ ] **Step 12.5: Run tests**

```bash
pnpm --filter @utter/web test components/__tests__/TranscriptList.test.tsx
```
Expected: 2 passing.

- [ ] **Step 12.6: Commit**

```bash
git add web/components/TranscriptList.tsx web/components/VideoPlayer.tsx web/components/__tests__/TranscriptList.test.tsx
git commit -m "feat(web): transcript list with active-segment sync + video player"
```

---

## Task 13: Recording detail page (admin)

**Files:**
- Create: `web/app/r/[id]/page.tsx`
- Create: `web/app/r/[id]/Detail.tsx`

- [ ] **Step 13.1: Create `web/app/r/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getRecording } from "@/lib/recordings";
import { getSignedPlaybackUrl } from "@/lib/r2";
import { Detail } from "./Detail";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function RecordingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getRecording(id);
  if (!rec) notFound();
  const videoUrl = await getSignedPlaybackUrl(rec.r2Key);
  return (
    <div className="grid grid-cols-[220px_1fr] min-h-screen">
      <Sidebar active="recordings" />
      <Detail recording={rec} videoUrl={videoUrl} />
    </div>
  );
}
```

- [ ] **Step 13.2: Create `web/app/r/[id]/Detail.tsx`**

```tsx
"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import type { Recording } from "@utter/shared";
import { TranscriptList } from "@/components/TranscriptList";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/VideoPlayer";
import { ChatPanel } from "@/components/ChatPanel";
import { formatDate, formatDuration } from "@/lib/format";

export function Detail({ recording, videoUrl }: { recording: Recording; videoUrl: string }) {
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const [t, setT] = useState(0);
  const segs = recording.transcript?.segments ?? [];

  return (
    <div className="grid grid-cols-[1fr_380px] min-h-screen">
      <div className="border-r border-line-1 px-8 py-7 flex flex-col gap-5">
        <nav className="font-mono text-[10.5px] uppercase tracking-wider text-text-2">
          <Link href="/" className="text-text-1 hover:text-text-0">Recordings</Link>
          <span className="mx-2 text-line-2">/</span>
          <span>{recording.title}</span>
        </nav>
        <header>
          <h1 className="font-display text-3xl font-semibold tracking-tighter mb-2">{recording.title}</h1>
          <div className="flex flex-wrap gap-3.5 font-mono text-[10.5px] uppercase tracking-wider text-text-2">
            <span>{formatDate(recording.createdAt)}</span>
            <span className="text-line-2">·</span>
            <span>{formatDuration(recording.durationMs)} duration</span>
            <span className="text-line-2">·</span>
            <span>{recording.transcript?.model ?? "—"}</span>
            {recording.shareToken && (<>
              <span className="text-line-2">·</span>
              <span className="text-accent">Shared</span>
            </>)}
          </div>
        </header>
        <VideoPlayer ref={playerRef} src={videoUrl} onTimeUpdate={setT} />
        <TranscriptList segments={segs} currentTime={t} onSeek={(s) => playerRef.current?.seekTo(s)} />
      </div>
      <ChatPanel recordingId={recording.id} initialChats={recording.chats} onCitationClick={(s) => playerRef.current?.seekTo(s)} />
    </div>
  );
}
```

- [ ] **Step 13.3: Commit**

`Detail.tsx` references `ChatPanel`, which is created in task 19. Typecheck will fail until then — that's expected. Commit anyway and we'll typecheck after task 19.

```bash
git add web/app/r
git commit -m "feat(web): recording detail page wiring (ChatPanel arrives in task 19)"
```

---

## Task 14: Share token API

**Files:**
- Create: `web/app/api/recordings/[id]/share/route.ts`

- [ ] **Step 14.1: Create the route**

```ts
// web/app/api/recordings/[id]/share/route.ts
import { NextResponse } from "next/server";
import { mintShareToken, revokeShareToken } from "@/lib/recordings";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const token = await mintShareToken(id);
    return NextResponse.json({ token });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await revokeShareToken(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 14.2: Commit**

```bash
git add web/app/api/recordings/[id]/share
git commit -m "feat(web): mint and revoke share tokens"
```

---

## Task 15: Public share API + page

**Files:**
- Create: `web/app/api/share/[token]/route.ts`
- Create: `web/app/share/[token]/page.tsx`
- Create: `web/app/share/[token]/Public.tsx`

- [ ] **Step 15.1: Create `web/app/api/share/[token]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getRecordingByShareToken } from "@/lib/recordings";
import { getSignedPlaybackUrl } from "@/lib/r2";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rec = await getRecordingByShareToken(token);
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = await getSignedPlaybackUrl(rec.r2Key);
  // Strip chat history and r2 details from response
  const { chats: _c, r2Bucket: _b, r2Key: _k, failureReason: _f, ...safe } = rec;
  return NextResponse.json({ recording: safe, videoUrl: url });
}
```

- [ ] **Step 15.2: Create `web/app/share/[token]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getRecordingByShareToken } from "@/lib/recordings";
import { getSignedPlaybackUrl } from "@/lib/r2";
import { Public } from "./Public";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rec = await getRecordingByShareToken(token);
  if (!rec) notFound();
  const videoUrl = await getSignedPlaybackUrl(rec.r2Key);
  return <Public recording={rec} videoUrl={videoUrl} />;
}
```

- [ ] **Step 15.3: Create `web/app/share/[token]/Public.tsx`**

```tsx
"use client";
import { useRef, useState } from "react";
import type { Recording } from "@utter/shared";
import { TranscriptList } from "@/components/TranscriptList";
import { VideoPlayer, type VideoPlayerHandle } from "@/components/VideoPlayer";
import { Logo } from "@/components/Logo";
import { formatDate, formatDuration } from "@/lib/format";

export function Public({ recording, videoUrl }: { recording: Recording; videoUrl: string }) {
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const [t, setT] = useState(0);
  const segs = recording.transcript?.segments ?? [];

  return (
    <div className="min-h-screen px-6 py-10 max-w-4xl mx-auto">
      <header className="flex items-center gap-2.5 mb-8">
        <Logo />
        <span className="font-display font-semibold text-lg tracking-tighter">Utter</span>
      </header>

      <h1 className="font-display text-3xl font-semibold tracking-tighter mb-2">{recording.title}</h1>
      <div className="flex flex-wrap gap-3.5 font-mono text-[10.5px] uppercase tracking-wider text-text-2 mb-6">
        <span>{formatDate(recording.createdAt)}</span>
        <span className="text-line-2">·</span>
        <span>{formatDuration(recording.durationMs)} duration</span>
      </div>

      <VideoPlayer ref={playerRef} src={videoUrl} onTimeUpdate={setT} />
      <div className="h-5" />
      <TranscriptList segments={segs} currentTime={t} onSeek={(s) => playerRef.current?.seekTo(s)} />

      <footer className="mt-10 pt-6 border-t border-line-1 font-mono text-[10px] uppercase tracking-wider text-text-2 flex justify-between">
        <span>Shared via Utter</span>
        <span>{recording.transcript?.model ?? "—"}</span>
      </footer>
    </div>
  );
}
```

- [ ] **Step 15.4: Commit**

```bash
git add web/app/share web/app/api/share
git commit -m "feat(web): public share page and api endpoint"
```

---

## Task 16: Share-link UI on detail page

**Files:**
- Create: `web/components/ShareControl.tsx`
- Modify: `web/app/r/[id]/Detail.tsx` (add ShareControl below the header)

- [ ] **Step 16.1: Create `web/components/ShareControl.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Button } from "./Button";

export function ShareControl({ recordingId, initialToken, baseUrl }: { recordingId: string; initialToken: string | null; baseUrl: string }) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function mint() {
    setBusy(true);
    const res = await fetch(`/api/recordings/${recordingId}/share`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (res.ok) setToken(data.token as string);
  }
  async function revoke() {
    if (!confirm("Revoke this share link? Anyone with the URL will lose access.")) return;
    setBusy(true);
    await fetch(`/api/recordings/${recordingId}/share`, { method: "DELETE" });
    setBusy(false);
    setToken(null);
  }
  async function copy() {
    if (!token) return;
    await navigator.clipboard.writeText(`${baseUrl}/share/${token}`);
    setCopied(true); setTimeout(() => setCopied(false), 1200);
  }

  if (!token) {
    return (
      <div className="flex items-center gap-3">
        <Button onClick={mint} disabled={busy} variant="ghost" size="sm">
          {busy ? "Creating…" : "Create share link"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-1.5 border border-accent/30 bg-accent/[0.06] rounded-md">
      <span className="font-mono text-[11.5px] text-accent px-2 tracking-wide">
        {baseUrl.replace(/^https?:\/\//, "")}/share/{token}
      </span>
      <Button onClick={copy} variant="ghost" size="sm">
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button onClick={revoke} disabled={busy} variant="danger" size="sm">Revoke</Button>
    </div>
  );
}
```

- [ ] **Step 16.2: Edit `web/app/r/[id]/Detail.tsx`**

Find the `<header>...</header>` block and append below it (still inside the left column flex):

```tsx
<ShareControl recordingId={recording.id} initialToken={recording.shareToken} baseUrl={typeof window === "undefined" ? "" : window.location.origin} />
```

Add `import { ShareControl } from "@/components/ShareControl";` to the imports.

- [ ] **Step 16.3: Commit**

```bash
git add web/components/ShareControl.tsx web/app/r/[id]/Detail.tsx
git commit -m "feat(web): share link UI with mint/copy/revoke"
```

---

## Task 17: Claude prompt builder + citation parser

**Files:**
- Create: `web/lib/claude.ts`
- Create: `web/lib/__tests__/claude.test.ts`

- [ ] **Step 17.1: Write the failing test**

```ts
// web/lib/__tests__/claude.test.ts
import { describe, expect, it } from "vitest";
import { buildSystemPrompt, parseCitations } from "../claude";

const segs = [
  { start: 0, end: 5, text: "Hello." },
  { start: 65, end: 70, text: "Action items: ship by Friday." },
];

describe("buildSystemPrompt", () => {
  it("emits one HH:MM:SS line per segment", () => {
    const sys = buildSystemPrompt({ title: "Sync", segments: segs });
    expect(sys).toContain("[00:00:00] Hello.");
    expect(sys).toContain("[00:01:05] Action items: ship by Friday.");
  });
  it("includes a clear citation instruction", () => {
    const sys = buildSystemPrompt({ title: "Sync", segments: segs });
    expect(sys).toMatch(/cite.+\[HH:MM:SS\]/i);
  });
});

describe("parseCitations", () => {
  it("returns text segments and citations alternating", () => {
    const out = parseCitations("Look at [00:01:05] for details.");
    expect(out).toEqual([
      { type: "text", text: "Look at " },
      { type: "cite", seconds: 65, label: "00:01:05" },
      { type: "text", text: " for details." },
    ]);
  });
  it("handles HH:MM:SS and MM:SS", () => {
    const out = parseCitations("at [01:05] and [01:02:03]");
    expect(out.filter((p) => p.type === "cite")).toEqual([
      { type: "cite", seconds: 65, label: "01:05" },
      { type: "cite", seconds: 3723, label: "01:02:03" },
    ]);
  });
  it("ignores malformed brackets", () => {
    const out = parseCitations("[hi] or [99:99:99x]");
    expect(out.every((p) => p.type === "text")).toBe(true);
  });
});
```

- [ ] **Step 17.2: Run test (fails)**

Expected: FAIL.

- [ ] **Step 17.3: Implement `web/lib/claude.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { formatTime, parseTime, type TranscriptSegment } from "@utter/shared";

let cached: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  cached = new Anthropic({ apiKey });
  return cached;
}

export interface PromptInput {
  title: string;
  segments: TranscriptSegment[];
}

export function buildSystemPrompt({ title, segments }: PromptInput): string {
  const transcriptLines = segments.map((s) => `[${formatTime(s.start)}] ${s.text}`).join("\n");
  return [
    "You are an assistant analyzing a meeting recording. The transcript below has timestamped segments.",
    "When you reference something specific that was said, cite the moment in [HH:MM:SS] form so the user can click to jump there.",
    "Prefer concrete quotes and specifics over vague summaries. Decline to fabricate — if it isn't in the transcript, say so.",
    `\nTITLE: ${title}\n`,
    "TRANSCRIPT:",
    transcriptLines,
  ].join("\n");
}

export type CitationPart =
  | { type: "text"; text: string }
  | { type: "cite"; seconds: number; label: string };

const CITE_RE = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;

export function parseCitations(text: string): CitationPart[] {
  const out: CitationPart[] = [];
  let last = 0;
  for (const m of text.matchAll(CITE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ type: "text", text: text.slice(last, idx) });
    const label = m[1]!;
    const seconds = parseTime(label);
    if (seconds == null) {
      out.push({ type: "text", text: m[0] });
    } else {
      out.push({ type: "cite", seconds, label });
    }
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}
```

- [ ] **Step 17.4: Run tests**

Expected: 5 passing.

- [ ] **Step 17.5: Commit**

```bash
git add web/lib/claude.ts web/lib/__tests__/claude.test.ts
git commit -m "feat(web): system prompt builder and citation parser for Claude"
```

---

## Task 18: Streaming Claude chat endpoint

**Files:**
- Create: `web/app/api/recordings/[id]/chat/route.ts`

- [ ] **Step 18.1: Create the route**

```ts
import { NextResponse } from "next/server";
import { getRecording, appendChatTurn } from "@/lib/recordings";
import { buildSystemPrompt, getAnthropic } from "@/lib/claude";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface IncomingMessage { role: "user" | "assistant"; content: string }

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { messages?: IncomingMessage[] } | null;
  if (!body?.messages?.length) return NextResponse.json({ error: "Missing messages" }, { status: 400 });

  const rec = await getRecording(id);
  if (!rec) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!rec.transcript) return NextResponse.json({ error: "Transcript not ready" }, { status: 409 });

  const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
  if (lastUser) await appendChatTurn(id, { role: "user", content: lastUser.content });

  const system = buildSystemPrompt({ title: rec.title, segments: rec.transcript.segments });
  const client = getAnthropic();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let assembled = "";
      try {
        const resp = await client.messages.stream({
          model: "claude-opus-4-7",
          max_tokens: 2000,
          system: [
            { type: "text", text: system, cache_control: { type: "ephemeral" } },
          ],
          messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
        });
        for await (const event of resp) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            const t = event.delta.text;
            assembled += t;
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: t })}\n\n`));
          }
        }
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        if (assembled) await appendChatTurn(id, { role: "assistant", content: assembled });
      } catch (err) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 18.2: Commit**

```bash
git add web/app/api/recordings/[id]/chat
git commit -m "feat(web): streaming Claude chat endpoint with prompt cache"
```

---

## Task 19: Chat panel UI with citations

**Files:**
- Create: `web/components/ChatPanel.tsx`
- Create: `web/components/Citation.tsx`

- [ ] **Step 19.1: Create `web/components/Citation.tsx`**

```tsx
"use client";
export function Citation({ label, seconds, onClick }: { label: string; seconds: number; onClick: (s: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(seconds)}
      className="inline-flex items-center font-mono text-[10.5px] tracking-wide tabular-nums text-accent bg-accent/[0.12] border border-accent/25 px-1.5 py-px rounded mx-0.5 hover:bg-accent/20 transition-colors"
    >
      [{label}]
    </button>
  );
}
```

- [ ] **Step 19.2: Create `web/components/ChatPanel.tsx`**

```tsx
"use client";
import { useRef, useState } from "react";
import type { ChatMessage } from "@utter/shared";
import { parseCitations } from "@/lib/claude";
import { Citation } from "./Citation";
import { Kbd } from "./Kbd";

interface Props {
  recordingId: string;
  initialChats: ChatMessage[];
  onCitationClick: (seconds: number) => void;
}

export function ChatPanel({ recordingId, initialChats, onCitationClick }: Props) {
  const [chats, setChats] = useState<ChatMessage[]>(initialChats);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next: ChatMessage[] = [...chats, { role: "user", content: text, createdAt: new Date().toISOString() }];
    setChats(next);
    setBusy(true);
    setStreaming("");

    const res = await fetch(`/api/recordings/${recordingId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: next.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => null);
      setChats((c) => [...c, { role: "assistant", content: `Error: ${err?.error ?? res.statusText}`, createdAt: new Date().toISOString() }]);
      setBusy(false);
      return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let assembled = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop() ?? "";
      for (const ev of events) {
        const line = ev.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        try {
          const obj = JSON.parse(line.slice(6));
          if (obj.delta) {
            assembled += obj.delta;
            setStreaming((s) => s + obj.delta);
          }
          if (obj.error) {
            assembled = `Error: ${obj.error}`;
            setStreaming(assembled);
          }
        } catch { /* ignore */ }
      }
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }

    setChats((c) => [...c, { role: "assistant", content: assembled, createdAt: new Date().toISOString() }]);
    setStreaming("");
    setBusy(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <aside className="flex flex-col bg-black/[0.16] min-h-screen">
      <header className="px-5 py-4 border-b border-line-1 flex items-center gap-2.5">
        <span className="grid place-items-center w-5.5 h-5.5 rounded-[5px] bg-gradient-to-br from-[#DD7A4A] to-[#B85432] font-display font-bold text-[13px] text-white" style={{ width: 22, height: 22 }}>C</span>
        <h3 className="font-display font-semibold text-base tracking-tight m-0">Ask Claude</h3>
        <span className="ml-auto font-mono text-[9.5px] uppercase tracking-widest text-text-2">opus 4.7</span>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        {chats.length === 0 && !streaming && (
          <p className="text-text-2 text-sm">Ask anything about this recording — decisions, action items, exact quotes, follow-ups.</p>
        )}
        {chats.map((m, i) => (m.role === "user" ? <UserBubble key={i} text={m.content} /> : <AssistantBubble key={i} text={m.content} onCite={onCitationClick} />))}
        {streaming && <AssistantBubble text={streaming} onCite={onCitationClick} />}
      </div>

      <div className="border-t border-line-1 px-4 py-4 bg-black/[0.2]">
        <div className="bg-bg-2 border border-line-1 focus-within:border-line-2 rounded-md px-3 py-2.5 flex items-end gap-2.5">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask anything about this recording…"
            className="flex-1 bg-transparent border-0 outline-none resize-none text-[13.5px] leading-snug min-h-[22px] text-text-0 placeholder:text-text-2 font-sans"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="w-7 h-7 grid place-items-center rounded bg-accent hover:bg-accent-hover disabled:opacity-50"
          >
            <span className="block w-0 h-0 border-l-[8px] border-l-white border-y-[5px] border-y-transparent ml-0.5" />
          </button>
        </div>
        <div className="flex justify-between mt-2 font-mono text-[9.5px] uppercase tracking-widest text-text-2">
          <span><Kbd>↩</Kbd> to send · <Kbd>⇧↩</Kbd> new line</span>
        </div>
      </div>
    </aside>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="self-end max-w-[85%] bg-accent/[0.12] border border-accent/20 px-3 py-2 rounded-[10px_10px_2px_10px] text-[13.5px]">{text}</div>
  );
}

function AssistantBubble({ text, onCite }: { text: string; onCite: (s: number) => void }) {
  const parts = parseCitations(text);
  return (
    <div className="text-[13.5px] leading-[1.6] whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.type === "text" ? <span key={i}>{p.text}</span> : <Citation key={i} label={p.label} seconds={p.seconds} onClick={onCite} />
      )}
    </div>
  );
}
```

- [ ] **Step 19.3: Typecheck the web app**

```bash
pnpm --filter @utter/web typecheck
```
Expected: passes (Detail.tsx now resolves ChatPanel).

- [ ] **Step 19.4: Commit**

```bash
git add web/components/ChatPanel.tsx web/components/Citation.tsx
git commit -m "feat(web): streaming chat panel with clickable citations"
```

---

## Task 20: Wire share-link reveal into RecordingsTable

(Pure UX polish — show the inline copy action when there's a token.)

**Files:**
- Modify: `web/components/RecordingsTable.tsx`

- [ ] **Step 20.1: Replace the share-cell render in `RecordingsTable.tsx`**

Find the line:

```tsx
<div className={`font-mono text-[11.5px] tracking-wide ${r.shareToken ? "text-accent" : "text-text-2"}`}>
  {r.shareToken ? `utter.app/s/${r.shareToken}` : "—"}
</div>
```

Replace with:

```tsx
<div className={`font-mono text-[11.5px] tracking-wide truncate ${r.shareToken ? "text-accent" : "text-text-2"}`}>
  {r.shareToken ? `/share/${r.shareToken}` : "—"}
</div>
```

- [ ] **Step 20.2: Commit**

```bash
git add web/components/RecordingsTable.tsx
git commit -m "feat(web): show relative share path in dashboard table"
```

---

## Task 21: Seed script for local development

**Files:**
- Create: `web/scripts/seed.ts`
- Modify: `web/package.json` (add `seed` script)

- [ ] **Step 21.1: Create `web/scripts/seed.ts`**

```ts
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { ObjectId } from "mongodb";
import { getRecordingsCollection, ensureIndexes } from "../lib/db";

async function main() {
  await ensureIndexes();
  const col = await getRecordingsCollection();
  await col.deleteMany({});

  const segments = [
    { start: 0,   end: 4,   text: "Welcome everyone to the design sync." },
    { start: 4,   end: 9,   text: "I want to talk about the recording state — it should feel like a hardware meter." },
    { start: 9,   end: 14,  text: "Mono numbers, blinking light, levels. People know what that means." },
    { start: 14,  end: 21,  text: "Let's pick Bricolage for display and Geist for everything else." },
    { start: 21,  end: 28,  text: "Mono is reserved for timestamps and any technical readout." },
    { start: 28,  end: 34,  text: "We should not center every layout. Asymmetry where it earns it." },
    { start: 34,  end: 40,  text: "And the transcript should feel like a script — a clean ledger of what was said." },
    { start: 40,  end: 50,  text: "Action item: ship the new design system by Friday." },
  ];
  const fullText = segments.map((s) => s.text).join(" ");

  await col.insertMany([
    {
      _id: new ObjectId(),
      title: "Sync with design",
      createdAt: new Date(Date.now() - 2 * 3600 * 1000),
      durationMs: 23 * 60 * 1000 + 14 * 1000,
      sizeBytes: 142_000_000,
      status: "ready",
      r2Key: "seed/sync-with-design.webm",
      r2Bucket: process.env.R2_BUCKET ?? "utter",
      mimeType: "video/webm" as const,
      transcript: { segments, fullText, language: "en", model: "whisper-large-v3" },
      chats: [],
      shareToken: null,
      failureReason: null,
    },
    {
      _id: new ObjectId(),
      title: "Founders standup",
      createdAt: new Date(Date.now() - 26 * 3600 * 1000),
      durationMs: 11 * 60 * 1000 + 8 * 1000,
      sizeBytes: 71_000_000,
      status: "ready",
      r2Key: "seed/founders-standup.webm",
      r2Bucket: process.env.R2_BUCKET ?? "utter",
      mimeType: "video/webm" as const,
      transcript: { segments, fullText, language: "en", model: "whisper-large-v3" },
      chats: [],
      shareToken: null,
      failureReason: null,
    },
    {
      _id: new ObjectId(),
      title: "Investor call · Felicis",
      createdAt: new Date(Date.now() - 4 * 24 * 3600 * 1000),
      durationMs: 42 * 60 * 1000 + 1 * 1000,
      sizeBytes: 240_000_000,
      status: "transcribing",
      r2Key: "seed/investor-call-felicis.webm",
      r2Bucket: process.env.R2_BUCKET ?? "utter",
      mimeType: "video/webm" as const,
      transcript: null,
      chats: [],
      shareToken: null,
      failureReason: null,
    },
  ]);

  console.log("Seeded 3 recordings.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 21.2: Add `dotenv` and `tsx` dev deps**

Edit `web/package.json` and add to `devDependencies`:

```json
"dotenv": "^16.4.5",
"tsx": "^4.19.2"
```

And add to `scripts`:

```json
"seed": "tsx scripts/seed.ts"
```

Then `pnpm install`.

- [ ] **Step 21.3: Run seed (requires Mongo)**

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=hunter2 \
SESSION_SECRET=this_is_a_test_secret_at_least_32_chars_long \
MONGODB_URI=mongodb://localhost:27017/utter \
pnpm --filter @utter/web seed
```
Expected: prints "Seeded 3 recordings."

- [ ] **Step 21.4: Commit**

```bash
git add web/scripts web/package.json pnpm-lock.yaml
git commit -m "feat(web): seed script for local development"
```

---

## Task 22: Frontend-design polish — top of dashboard

The brand atoms exist; now match the preview's atmosphere on the dashboard exactly: search box, storage indicator at the bottom of the sidebar, kicker line above the H1.

**Files:**
- Modify: `web/components/Sidebar.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 22.1: Update Sidebar storage block**

Replace the bottom block in `Sidebar.tsx`:

```tsx
<div className="mt-auto px-6 py-5 border-t border-line-1 font-mono text-[10px] uppercase tracking-wider text-text-2">
  <div className="flex justify-between mb-1.5">
    <span>Storage</span><span>2.3 / 50 GB</span>
  </div>
  <div className="h-[3px] bg-bg-2 rounded-sm overflow-hidden">
    <div className="h-full bg-accent" style={{ width: "5%" }} />
  </div>
</div>
```

- [ ] **Step 22.2: Add a search affordance to the dashboard toolbar**

In `web/app/page.tsx`, replace the `<header>` with:

```tsx
<header className="flex items-end justify-between mb-7">
  <div>
    <p className="font-mono text-[11px] uppercase tracking-wider text-text-2 mb-1">
      {recordings.length} recordings · {formatDuration(totalMs)} total
    </p>
    <h1 className="font-display text-3xl font-semibold tracking-tighter">Recordings</h1>
  </div>
  <label className="flex items-center gap-2 bg-bg-1 border border-line-1 rounded px-2.5 py-1.5 w-[280px]">
    <span className="text-text-2">⌕</span>
    <input
      placeholder="Search transcripts and titles…"
      className="bg-transparent outline-none text-[13px] flex-1 placeholder:text-text-2"
    />
    <kbd className="font-mono text-[10px] text-text-2 bg-bg-2 border border-line-1 px-1.5 py-px rounded-sm">⌘ K</kbd>
  </label>
</header>
```

(Note: search is non-functional for MVP; the input is a UX placeholder. We may wire it later — explicitly out of scope for this plan.)

- [ ] **Step 22.3: Commit**

```bash
git add web/components/Sidebar.tsx web/app/page.tsx
git commit -m "style(web): dashboard toolbar polish + storage indicator"
```

---

## Task 23: Login + 404 polish

**Files:**
- Modify: `web/app/login/page.tsx` (background grid)
- Create: `web/app/not-found.tsx`

- [ ] **Step 23.1: Add ambient grid behind the login card**

Edit `web/app/login/page.tsx`. Wrap the existing `<form>...</form>` in:

```tsx
<main className="min-h-screen grid place-items-center px-6 relative overflow-hidden">
  <div
    aria-hidden
    className="absolute inset-0 opacity-25 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
    style={{
      backgroundImage:
        "linear-gradient(#232936 1px, transparent 1px), linear-gradient(90deg, #232936 1px, transparent 1px)",
      backgroundSize: "32px 32px",
    }}
  />
  {/* existing form here, add `relative z-10` to the form's className */}
</main>
```

- [ ] **Step 23.2: Create `web/app/not-found.tsx`**

```tsx
import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center px-6">
      <div className="text-center">
        <div className="flex justify-center mb-4"><Logo size={32} /></div>
        <p className="font-mono text-[11px] uppercase tracking-wider text-text-2 mb-3">404 · Not found</p>
        <h1 className="font-display text-4xl font-semibold tracking-tighter mb-3">Nothing here.</h1>
        <p className="text-text-1 mb-6">The recording you're looking for doesn't exist or was revoked.</p>
        <Link href="/" className="text-accent hover:text-accent-hover font-mono text-sm">← Back to dashboard</Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 23.3: Commit**

```bash
git add web/app/login/page.tsx web/app/not-found.tsx
git commit -m "style(web): login background grid and 404 page"
```

---

## Task 24: Re-transcribe endpoint (failed recordings)

**Files:**
- Create: `web/app/api/recordings/[id]/retranscribe/route.ts`
- Create: `web/lib/transcribe.ts`
- Modify: `web/.env.example` (add `GROQ_API_KEY`)

The web app will rarely run transcription (the desktop app does it post-upload), but a "Retry" button on failed recordings is essential. Same Groq endpoint, called from the server.

- [ ] **Step 24.1: Add `GROQ_API_KEY` to `web/.env.example`**

```
# Optional: only needed for /api/recordings/:id/retranscribe in the web app.
# Primary transcription path runs in the desktop app.
GROQ_API_KEY=
```

- [ ] **Step 24.2: Create `web/lib/transcribe.ts`**

```ts
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client } from "./r2";
import type { Transcript } from "@utter/shared";

export async function transcribeWithGroq(r2Key: string): Promise<Transcript> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error("R2_BUCKET is not set");

  const obj = await getR2Client().send(new GetObjectCommand({ Bucket: bucket, Key: r2Key }));
  if (!obj.Body) throw new Error("Empty R2 object");
  const buffer = Buffer.from(await obj.Body.transformToByteArray());

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "video/webm" }), "audio.webm");
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Groq returned ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { text: string; language: string; segments?: Array<{ start: number; end: number; text: string }> };

  const segments = (data.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }));
  return { segments, fullText: data.text, language: data.language, model: "whisper-large-v3" };
}
```

- [ ] **Step 24.3: Create the retranscribe route**

```ts
// web/app/api/recordings/[id]/retranscribe/route.ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getRecordingsCollection } from "@/lib/db";
import { transcribeWithGroq } from "@/lib/transcribe";

export const runtime = "nodejs";
export const maxDuration = 300; // up to 5 minutes for big files

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const col = await getRecordingsCollection();
  const doc = await col.findOne({ _id: new ObjectId(id) });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await col.updateOne({ _id: doc._id }, { $set: { status: "transcribing", failureReason: null } });
  try {
    const transcript = await transcribeWithGroq(doc.r2Key);
    await col.updateOne({ _id: doc._id }, { $set: { transcript, status: "ready" } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    await col.updateOne({ _id: doc._id }, { $set: { status: "failed", failureReason: (e as Error).message } });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
```

- [ ] **Step 24.4: Commit**

```bash
git add web/lib/transcribe.ts web/app/api/recordings/[id]/retranscribe web/.env.example
git commit -m "feat(web): retranscribe endpoint using Groq Whisper"
```

---

## Task 25: Playwright happy path (login → dashboard → share)

**Files:**
- Create: `web/playwright.config.ts`
- Create: `web/e2e/happy.spec.ts`

- [ ] **Step 25.1: Install Playwright runtime**

```bash
pnpm --filter @utter/web exec playwright install chromium
```

- [ ] **Step 25.2: Create `web/playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "hunter2",
      SESSION_SECRET: "this_is_a_test_secret_at_least_32_chars_long_seriously",
      MONGODB_URI: "mongodb://127.0.0.1:27017/utter_e2e",
      R2_ACCOUNT_ID: "test",
      R2_ACCESS_KEY_ID: "test",
      R2_SECRET_ACCESS_KEY: "test",
      R2_BUCKET: "utter",
      ANTHROPIC_API_KEY: "test",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 25.3: Create `web/e2e/happy.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("login redirects unauthenticated users", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("login form rejects bad credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: false }).fill("admin");
  await page.getByLabel("Password", { exact: false }).fill("nope");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/Invalid credentials/i)).toBeVisible();
});

test("login form accepts good credentials and lands on dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: false }).fill("admin");
  await page.getByLabel("Password", { exact: false }).fill("hunter2");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Recordings" })).toBeVisible();
});
```

- [ ] **Step 25.4: Run the suite**

```bash
pnpm --filter @utter/web exec playwright test
```
Expected: 3 passing.

- [ ] **Step 25.5: Commit**

```bash
git add web/playwright.config.ts web/e2e
git commit -m "test(web): playwright happy-path coverage for login + dashboard"
```

---

## Task 26: Setup docs (runbook)

**Files:**
- Create: `docs/setup.md`
- Modify: `README.md` (create if missing)

- [ ] **Step 26.1: Create `docs/setup.md`**

```markdown
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
```

- [ ] **Step 26.2: Create `README.md`**

```markdown
# Utter

A meeting recorder for one. Capture a window, stream to R2 as it runs,
transcribe with Groq, and ask Claude what was said.

- `desktop/` — Tauri 2 app (records + uploads)
- `web/` — Next.js 15 app (admin dashboard, public share, Claude chat)
- `shared/` — TypeScript types
- `docs/` — design spec + implementation plans + brand preview

See `docs/setup.md` to run locally.

License: private.
```

- [ ] **Step 26.3: Commit**

```bash
git add docs/setup.md README.md
git commit -m "docs: add setup runbook and project README"
```

---

## Task 27: CI typecheck + tests

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 27.1: Create the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @utter/shared build
      - run: pnpm --filter @utter/shared test
      - run: pnpm --filter @utter/web typecheck
      - run: pnpm --filter @utter/web test
```

- [ ] **Step 27.2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: typecheck + unit tests on push and pull request"
```

---

## Task 28: Final spec coverage check

- [ ] **Step 28.1: Run the entire web suite locally**

```bash
pnpm --filter @utter/shared test
pnpm --filter @utter/web typecheck
pnpm --filter @utter/web test
```
Expected: all green.

- [ ] **Step 28.2: Manual smoke test (with Mongo running)**

```bash
pnpm --filter @utter/web seed
pnpm --filter @utter/web dev
```

Walk through:
1. `/` → redirected to `/login`
2. Sign in with the admin creds you set in `.env.local`
3. Dashboard shows the 3 seeded recordings
4. Click "Sync with design" → detail page loads (the `<video>` will fail to load because the seed key isn't in R2, but the transcript and chat panel render)
5. Click a transcript timestamp → currentTime would update if the video were real
6. Click "Create share link" → token appears, "Copy" button works
7. Open `/share/<token>` in an incognito window → public page shows transcript without the chat panel
8. Click "Revoke" → public link 404s

- [ ] **Step 28.3: Commit a final marker**

```bash
git commit --allow-empty -m "chore: web app + shared infra plan complete"
```

---

## Spec coverage summary

| Spec section | Tasks |
|---|---|
| Repo layout (`shared/`, `web/`) | 1, 2, 3 |
| Brand tokens, fonts, design language | 3, 4, 22, 23 |
| Admin auth via env-vars + `iron-session` | 7, 8 |
| Middleware gating | 8 |
| MongoDB schema + indexes | 5, 6 |
| Recordings list + detail (admin) | 9, 11, 12, 13 |
| Transcript synced playback | 12, 13 |
| Share token mint/revoke | 14, 16 |
| Public share page (no chat, no auth) | 15 |
| Claude chat with cached system prompt + citation parsing | 17, 18, 19 |
| Re-transcribe failed recordings | 24 |
| Seed for local development | 21 |
| Setup / R2 / CORS docs | 26 |
| Typecheck + unit + e2e in CI | 25, 27 |

The desktop-side concerns (capture, multipart upload, post-stop transcription, system tray, audio meter, frosted floating pill) live in the next plan: `2026-05-01-utter-desktop.md`.
