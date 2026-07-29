import { withAuth } from 'next-auth/middleware';
import { sessionCookieName } from '@/lib/authCookies';

/**
 * Protect the admin area. Unauthenticated visitors to any /admin route (except
 * the login page) are redirected to /admin/login. Mutating API routes are
 * additionally guarded server-side via requireAdmin() in each handler.
 */
export default withAuth({
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

export const config = {
  // Match every /admin route except the login page itself.
  matcher: ['/admin', '/admin/((?!login$).+)'],
};
