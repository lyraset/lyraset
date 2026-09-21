import { api, json, requireCronSecret } from '@/lib/workspace/route';
import { markAbsences } from '@/lib/workspace/services/cron';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Mark yesterday absent for anyone who should have worked and did not.
 *
 * Each office is read in its own timezone, exempt users are skipped entirely,
 * and a day already settled or inside a locked period is left untouched, so
 * re-running the job changes nothing the second time.
 */
export const GET = api(async (req) => {
  requireCronSecret(req);
  const result = await markAbsences();

  if (result.marked) {
    await logAudit({
      action: 'cron.mark_absent',
      targetType: 'attendance',
      meta: result,
      req,
    });
  }

  return json({ ok: true, ...result });
});

export const POST = GET;
