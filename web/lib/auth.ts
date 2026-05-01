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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getIronSession<SessionData>(c as any, sessionOptions());
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
