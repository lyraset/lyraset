/**
 * First gate for /workspace pages and /api/workspace routes.
 * Next.js 16+: rename this file to proxy.js and the export to `proxy`.
 * If the CMS already has a middleware.js, merge this logic into it (one file only).
 */
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./lib/workspace/session.js";
import { isPathAllowed, resolveAccess } from "./lib/workspace/routeAccess.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isSameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients; browsers always send Origin on cross-site POSTs
  try {
    return new URL(origin).host === req.nextUrl.host;
  } catch {
    return false;
  }
}

function harden(res) {
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "same-origin");
  return res;
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && !SAFE_METHODS.has(req.method) && !isSameOrigin(req)) {
    return harden(NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 }));
  }

  if (resolveAccess(pathname).type === "public") return harden(NextResponse.next());

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    if (isApi) {
      return harden(NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 }));
    }
    const url = new URL("/workspace/login", req.url);
    url.searchParams.set("next", pathname);
    return harden(NextResponse.redirect(url));
  }

  if (!isPathAllowed(session, pathname)) {
    if (isApi) {
      return harden(NextResponse.json({ error: "You don't have permission to do this." }, { status: 403 }));
    }
    return harden(NextResponse.redirect(new URL("/workspace?denied=1", req.url)));
  }

  return harden(NextResponse.next());
}

export const config = {
  matcher: ["/workspace/:path*", "/api/workspace/:path*"],
};
