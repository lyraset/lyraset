/**
 * Session cookie naming, shared by the NextAuth handler (Node runtime) and the
 * middleware (Edge runtime).
 *
 * NextAuth derives the `__Secure-` prefix from NEXTAUTH_URL, but the handler and
 * the middleware resolve that variable differently: middleware.js cannot import
 * lib/auth.js (that would pull mongoose into the Edge bundle), so the runtime
 * NEXTAUTH_URL fallback there never applies to the Edge side. When the two
 * disagree the handler writes `__Secure-next-auth.session-token` while the
 * middleware reads `next-auth.session-token` — sign-in appears to succeed, then
 * every /admin request bounces back to the login page.
 *
 * NODE_ENV is inlined into both bundles at build time, so keying off it keeps
 * the two runtimes in agreement without depending on NEXTAUTH_URL or VERCEL.
 * The `__Secure-` prefix requires HTTPS, so it must stay off in development.
 */

export const useSecureCookies = process.env.NODE_ENV === 'production';

export const sessionCookieName = `${useSecureCookies ? '__Secure-' : ''}next-auth.session-token`;
