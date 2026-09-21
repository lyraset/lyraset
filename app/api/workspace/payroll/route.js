import { z } from 'zod';
import { P } from '@/lib/workspace/permissions';
import { requireApiPermission } from '@/lib/workspace/auth';
import { api, json, query, readJson } from '@/lib/workspace/route';
import { parseBody, parseQuery, office } from '@/lib/workspace/validation';
import { listPeriods, lockPeriod, unlockPeriod } from '@/lib/workspace/services/payroll';
import { buildReport, REPORTS } from '@/lib/workspace/services/reports';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const cycleKey = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, 'Use a cycle in YYYY-MM format.');

const ListSchema = z.object({
  office: office.default('ISLAMABAD'),
  cycleKey: cycleKey.optional(),
});

/** The cycles an office can review, plus the payroll summary for one of them. */
export const GET = api(async (req) => {
  await requireApiPermission(P.PAYROLL_LOCK);
  const { office: officeCode, cycleKey: key } = parseQuery(ListSchema, query(req));

  const periods = await listPeriods({ office: officeCode });
  const summary = key
    ? await buildReport({ key: REPORTS.PAYROLL, filters: { office: officeCode, cycleKey: key } })
    : null;

  return json({ office: officeCode, periods, summary });
});

const ActionSchema = z.object({
  action: z.enum(['LOCK', 'UNLOCK']),
  office,
  cycleKey,
  reason: z.string().trim().max(500).nullish(),
});

/**
 * Lock or unlock a cycle.
 * Locking makes that cycle read-only for everyone, the Owner included, until
 * it is unlocked with a reason that is kept in the audit log.
 */
export const POST = api(async (req) => {
  const actor = await requireApiPermission(P.PAYROLL_LOCK);
  const input = parseBody(ActionSchema, await readJson(req));

  const period =
    input.action === 'LOCK'
      ? await lockPeriod({ actor, office: input.office, cycleKey: input.cycleKey, req })
      : await unlockPeriod({
          actor,
          office: input.office,
          cycleKey: input.cycleKey,
          reason: input.reason,
          req,
        });

  return json({ period });
});
