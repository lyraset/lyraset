import { api, json, requireCronSecret } from '@/lib/workspace/route';
import { autoCloseStaleSessions } from '@/lib/workspace/services/attendance';
import {
  markAbsences,
  sendClockInReminders,
  sendClockOutReminders,
  sendDailySummary,
  sendProbationAlerts,
} from '@/lib/workspace/services/cron';
import { rollOverCycle } from '@/lib/workspace/services/leave';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Every scheduled job, in one request.
 *
 * Vercel's Hobby plan allows only two cron jobs, so five separate entries would
 * silently fail to register there. This runs them in sequence behind a single
 * schedule, which keeps a Hobby deployment correct; on Pro the individual
 * routes are still available and can be scheduled separately at tighter
 * intervals (see WORKSPACE.md).
 *
 * The order matters. Sessions are closed before absence is judged, so someone
 * who forgot to clock out is not also marked absent. Everything is idempotent,
 * so a partial run followed by a retry settles to the same state.
 */
const JOBS = [
  ['autoClose', () => autoCloseStaleSessions()],
  ['markAbsent', () => markAbsences()],
  ['cycleRollover', () => rollOverCycle()],
  ['clockInReminders', () => sendClockInReminders()],
  ['clockOutReminders', () => sendClockOutReminders()],
  ['dailySummary', () => sendDailySummary()],
  ['probationAlerts', () => sendProbationAlerts()],
];

export const GET = api(async (req) => {
  requireCronSecret(req);

  const results = {};
  const failures = [];

  // One job failing must not stop the rest: a mail outage should never mean
  // nobody gets marked absent.
  for (const [name, run] of JOBS) {
    try {
      results[name] = await run();
    } catch (err) {
      console.error('[workspace cron] ' + name + ' failed', err);
      results[name] = { error: err?.message ?? 'failed' };
      failures.push(name);
    }
  }

  await logAudit({
    action: 'cron.daily',
    targetType: 'cron',
    meta: { results, failures },
    req,
  });

  // 207 when something failed, so a monitor can tell a partial run from a
  // clean one without parsing the body.
  return json({ ok: failures.length === 0, failures, results }, failures.length ? 207 : 200);
});

export const POST = GET;
