import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json } from '@/lib/workspace/route';
import { getTodayState } from '@/lib/workspace/services/attendance';
import { getBalanceSummary } from '@/lib/workspace/services/leave';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Everything the clock panel needs: schedule, live record, leave balance. */
export const GET = api(async () => {
  const user = await requireApiPermission(P.ATTENDANCE_SELF);
  const [state, balance] = await Promise.all([
    getTodayState({ user }),
    getBalanceSummary({ user }).catch(() => null),
  ]);
  return json({ ...state, leaveBalance: balance });
});
