import { api, json, requireCronSecret } from '@/lib/workspace/route';
import { autoCloseStaleSessions } from '@/lib/workspace/services/attendance';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Close sessions left open past the shift end plus the Owner's offset.
 *
 * The same check also runs lazily whenever a user loads the dashboard or
 * clocks in, because the Hobby plan only allows a daily cron. Both paths are
 * idempotent, so a late cron racing a page load produces one clock-out.
 */
export const GET = api(async (req) => {
  requireCronSecret(req);
  const result = await autoCloseStaleSessions();

  if (result.closed) {
    await logAudit({
      action: 'cron.auto_close',
      targetType: 'attendance',
      meta: { closed: result.closed, workDates: result.records.map((r) => r.workDate) },
      req,
    });
  }

  return json({ ok: true, closed: result.closed });
});

export const POST = GET;
