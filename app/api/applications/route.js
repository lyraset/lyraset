import Application from '@/models/Application';
import { isDbConfigured, connectToDatabase } from '@/lib/db';
import { guardAdmin, json, ok, fail, readJson, clientIp } from '@/lib/apiHelpers';
import { plain } from '@/lib/utils';
import { applicationSchema, safeValidate } from '@/lib/validation';
import { rateLimit } from '@/lib/rateLimit';
import { notifyNewSubmission } from '@/lib/notify';

export const dynamic = 'force-dynamic';

/** Admin: list all applications (newest first). */
export async function GET() {
  const denied = await guardAdmin();
  if (denied) return denied;
  if (!isDbConfigured()) return json({ ok: true, items: [] });
  await connectToDatabase();
  const items = await Application.find({}).sort({ createdAt: -1 }).lean();
  return json({ ok: true, items: items.map(plain) });
}

/** Public: submit a job application. */
export async function POST(req) {
  const ip = clientIp(req);
  const { allowed } = rateLimit(`app:${ip}`, 4, 60_000);
  if (!allowed) return fail('Too many requests. Please try again shortly.', 429);

  const body = (await readJson(req)) || {};

  // Honeypot, checked before validation — see the matching note in
  // app/api/leads/route.js. A 422 naming `company` would tell a bot exactly
  // which field to stop filling; a 200 tells it nothing.
  if (typeof body.company === 'string' && body.company.trim() !== '') {
    return ok({ item: null });
  }

  const { success, data, errors } = safeValidate(applicationSchema, body);
  if (!success) return fail('Validation failed', 422, { errors });

  if (!isDbConfigured()) return ok({ item: null, demo: true });

  await connectToDatabase();
  const doc = await Application.create({
    name: data.name,
    email: data.email,
    role: data.role,
    jobSlug: data.jobSlug || '',
    portfolioUrl: data.portfolioUrl || '',
    pitch: data.pitch,
    cv: data.cv || {},
    meta: { ip, userAgent: req.headers.get('user-agent') || '' },
  });

  notifyNewSubmission({
    subject: `New application: ${data.name} — ${data.role}`,
    lines: [
      { label: 'Name', value: data.name },
      { label: 'Email', value: data.email },
      { label: 'Role', value: data.role },
      { label: 'Portfolio', value: data.portfolioUrl || '—' },
    ],
  }).catch(() => {});

  return ok({ item: plain(doc) });
}
