import { api, json, requireCronSecret } from '@/lib/workspace/route';
import { sendDailySummary, sendProbationAlerts } from '@/lib/workspace/services/cron';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * The morning digest: yesterday's attendance for leadership, and a probation
 * alert to the Owner a week before anyone's probation ends.
 */
export const GET = api(async (req) => {
  requireCronSecret(req);
  const [summary, probation] = await Promise.all([sendDailySummary(), sendProbationAlerts()]);
  return json({ ok: true, summary, probation });
});

export const POST = GET;
