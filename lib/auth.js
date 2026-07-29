import CredentialsProvider from 'next-auth/providers/credentials';
import { getServerSession } from 'next-auth';
import bcrypt from 'bcryptjs';
import { isDbConfigured, connectToDatabase } from '@/lib/db';
import { useSecureCookies } from '@/lib/authCookies';

// On Vercel, give NextAuth a real https base URL even if NEXTAUTH_URL was not
// set, so cookies/callbacks never resolve to localhost in production. Only fills
// a missing value — set NEXTAUTH_URL explicitly to a custom domain if you use
// one, and never set it to a localhost URL in the production environment.
if (!process.env.NEXTAUTH_URL) {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (host) process.env.NEXTAUTH_URL = `https://${host}`;
}

/**
 * NextAuth (Credentials) configuration.
 *
 * Admin identity is stored in the database as an AdminUser document with a
 * bcrypt password hash. Authentication is DB-only — there is no environment
 * fallback. Seed or rotate the admin with `npm run seed` (which reads
 * ADMIN_EMAIL + ADMIN_PASSWORD_HASH to create/update the AdminUser).
 *
 * @type {import('next-auth').AuthOptions}
 */
export const authOptions = {
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 }, // 8h
  // Pinned rather than inferred from NEXTAUTH_URL so the cookie name matches
  // what the Edge middleware looks for. See lib/authCookies.js.
  useSecureCookies,
  providers: [
    CredentialsProvider({
      name: 'Admin',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = (credentials?.email || '').trim().toLowerCase();
        const password = credentials?.password || '';
        if (!email || !password) return null;
        if (!isDbConfigured()) {
          console.error('[auth] MONGODB_URI is not set in this environment — cannot sign in.');
          return null;
        }

        try {
          await connectToDatabase();
          const { default: AdminUser } = await import('@/models/AdminUser');
          const user = await AdminUser.findOne({ email }).lean();
          if (!user?.passwordHash) {
            console.error('[auth] no AdminUser found for', email, '— has this database been seeded?');
            return null;
          }
          const ok = await bcrypt.compare(password, user.passwordHash);
          if (!ok) {
            console.error('[auth] password mismatch for', email);
            return null;
          }
          return { id: String(user._id), email: user.email, name: user.name || 'Admin' };
        } catch (err) {
          // Surface the real cause (e.g. Atlas connection/timeout) in server
          // logs instead of silently returning a generic auth failure.
          console.error('[auth] admin lookup failed:', err?.message || err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = 'admin';
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role || 'admin';
        session.user.email = token.email;
      }
      return session;
    },
  },
  // In production NEXTAUTH_SECRET must be set. A dev-only fallback keeps
  // `npm run dev` working out of the box without leaking a usable prod secret.
  secret:
    process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV !== 'production' ? 'lyraset-dev-only-secret-change-me' : undefined),
  pages: { signIn: '/admin/login', error: '/admin/login' },
};

/**
 * Assert an authenticated admin session for a route handler.
 * @returns {Promise<{ ok: true, session: object } | { ok: false }>}
 */
export async function requireAdmin() {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role === 'admin') return { ok: true, session };
  } catch {
    // No/invalid session config (e.g. missing NEXTAUTH_SECRET) → treat as
    // unauthorized rather than a 500.
  }
  return { ok: false };
}
