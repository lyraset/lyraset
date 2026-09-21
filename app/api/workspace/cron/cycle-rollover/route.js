import { api, json, requireCronSecret } from '@/lib/workspace/route';
import { rollOverCycle } from '@/lib/workspace/services/leave';
import { logAudit } from '@/lib/workspace/audit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Close finished cycles and open the current one.
 *
 * Unused paid days either lapse or carry forward, up to the Owner's cap, and
 * the next cycle's balance row is created for everyone so quotas are visible
 * from the first day. A balance already rolled is skipped.
 */
export const GET = api(async (req) => {
  requireCronSecret(req);
  const result = await rollOverCycle();

  if (result.rolled) {
    await logAudit({
      action: 'cron.cycle_rollover',
      targetType: 'leave_balance',
      meta: result,
      req,
    });
  }

  return json({ ok: true, ...result });
});

export const POST = GET;
