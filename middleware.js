import { NextResponse } from 'next/server';
import { withAuth } from 'next-auth/middleware';
import { sessionCookieName } from '@/lib/authCookies';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/workspace/session';
import { isPathAllowed, resolveAccess } from '@/lib/workspace/routeAccess';

/**
 * One middleware, two protected areas.
 *
 * Next.js allows a single middleware file per project, so the CMS admin gate
 * (next-auth) and the workspace gate (our own signed cookie) are merged here
 * and dispatched by path prefix. Neither is the real enforcement layer:
 *   - /admin routes re-check with requireAdmin() in each handler
 *   - /workspace routes re-check with the requirePage and requireApi guards, which
 *     re-validate against the database (active, role, tokenVersion)
 * Middleware is only the first gate — it rejects the obvious cases cheaply and
 * keeps unauthenticated traffic off the database.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Protect the CMS admin area. Unauthenticated visitors land on /admin/login. */
const adminGate = withAuth({
  pages: { signIn: '/admin/login', error: '/admin/login' },
  secret:
    process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV !== 'production' ? 'lyraset-dev-only-secret-change-me' : undefined),
  // Without this, getToken() infers the cookie name from NEXTAUTH_URL/VERCEL,
  // which are not resolved the same way in the Edge bundle as in the Node
  // handler — so it would look for the unprefixed name in production and never
  // find the session. See lib/authCookies.js.
  cookies: { sessionToken: { name: sessionCookieName } },
  callbacks: {
    authorized: ({ token }) => token?.role === 'admin',
  },
});

/**
 * Browsers always send Origin on cross-site state-changing requests, so a
 * mismatch is a forged request. A missing Origin means a non-browser client
 * (curl, a cron runner), which the route's own auth still has to satisfy.
 */
function isSameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.nextUrl.host;
  } catch {
    return false;
  }
}

/** The workspace is internal: never indexed, never cached, never framed. */
function harden(res) {
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'same-origin');
  return res;
}

async function workspaceGate(req) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (isApi && !SAFE_METHODS.has(req.method) && !isSameOrigin(req)) {
    return harden(NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403 }));
  }

  // Cron routes carry a bearer secret instead of a session; the handler checks it.
  if (pathname.startsWith('/api/workspace/cron/')) return harden(NextResponse.next());

  if (resolveAccess(pathname).type === 'public') return harden(NextResponse.next());

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    if (isApi) {
      return harden(
        NextResponse.json({ error: 'Your session has ended. Sign in again.' }, { status: 401 })
      );
    }
    const url = new URL('/workspace/login', req.url);
    url.searchParams.set('next', pathname);
    return harden(NextResponse.redirect(url));
  }

  if (!isPathAllowed(session, pathname)) {
    if (isApi) {
      return harden(
        NextResponse.json({ error: "You don't have permission to do this." }, { status: 403 })
      );
    }
    return harden(NextResponse.redirect(new URL('/workspace?denied=1', req.url)));
  }

  return harden(NextResponse.next());
}

export default function middleware(req, event) {
  const { pathname } = req.nextUrl;
  if (
    pathname === '/workspace' ||
    pathname.startsWith('/workspace/') ||
    pathname.startsWith('/api/workspace')
  ) {
    return workspaceGate(req);
  }
  return adminGate(req, event);
}

export const config = {
  matcher: [
    // Every /admin route except the login page itself.
    '/admin',
    '/admin/((?!login$).+)',
    // The whole workspace area, pages and API alike.
    '/workspace',
    '/workspace/:path*',
    '/api/workspace/:path*',
  ],
};
