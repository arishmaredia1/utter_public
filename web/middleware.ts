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
