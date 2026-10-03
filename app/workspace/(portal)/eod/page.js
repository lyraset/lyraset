import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import Eod from '@/models/workspace/Eod';
import Attendance from '@/models/workspace/Attendance';
import Project from '@/models/workspace/Project';
import { getWorkspaceContext, cycleFor } from '@/lib/workspace/context';
import { serializeEod, isWithinEditWindow } from '@/lib/workspace/services/eod';
import { PageHead } from '@/components/workspace/ui';
import EodHistory from '@/components/workspace/EodHistory';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My EODs' };

/**
 * The employee's own EOD history.
 *
 * Days that were auto-closed appear here with a "Submit EOD" button, which is
 * how someone who forgot to clock out still accounts for their day.
 */
export default async function MyEodPage({ searchParams }) {
  const user = await requirePagePermission(P.EOD_SUBMIT);
  const sp = (await searchParams) ?? {};

  const ctx = await getWorkspaceContext();
  const cycle = cycleFor(ctx, new Date());
  const from = typeof sp.from === 'string' ? sp.from : cycle.startDate;
  const to = typeof sp.to === 'string' ? sp.to : cycle.endDate;

  await connectDB();
  const [eods, records, projects] = await Promise.all([
    Eod.find({ userId: user.id, workDate: { $gte: from, $lte: to } })
      .sort({ workDate: -1 })
      .lean(),
    Attendance.find({ userId: user.id, workDate: { $gte: from, $lte: to }, clockIn: { $ne: null } })
      .select('workDate workedMinutes status eodMissing autoClosed')
      .sort({ workDate: -1 })
      .lean(),
    Project.find({ active: true }).sort({ client: 1, name: 1 }).lean(),
  ]);

  const eodByDate = new Map(eods.map((e) => [e.workDate, e]));

  // Every day that has hours on it, whether or not it has a report yet.
  const rows = records.map((record) => {
    const eod = eodByDate.get(record.workDate) ?? null;
    return {
      workDate: record.workDate,
      workedMinutes: record.workedMinutes ?? 0,
      attendanceStatus: record.status,
      autoClosed: Boolean(record.autoClosed),
      eod: eod
        ? {
            ...serializeEod(eod, { includeVersions: true }),
            editable: isWithinEditWindow(eod, ctx.settings),
          }
        : null,
    };
  });

  return (
    <div className="ws-page">
      <PageHead
        title="My EODs"
        lead={'Cycle ' + cycle.label + ' · what you reported each day, with the hours beside it'}
      />
      <EodHistory
        rows={rows}
        userId={user.id}
        from={from}
        to={to}
        projects={projects.map((p) => ({
          id: String(p._id),
          name: p.name,
          client: p.client ?? null,
        }))}
        minDescription={ctx.settings?.eodMinDescriptionLength ?? 0}
        editWindowHours={ctx.settings?.eodEditWindowHours ?? 0}
      />
    </div>
  );
}
