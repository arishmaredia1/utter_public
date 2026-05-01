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
