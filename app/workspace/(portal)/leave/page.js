import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import LeaveRequest from '@/models/workspace/LeaveRequest';
import LeaveType from '@/models/workspace/LeaveType';
import { getBalanceSummary, serializeLeaveRequest } from '@/lib/workspace/services/leave';
import { formatDays } from '@/lib/workspace/calc/leave';
import { PageHead, Panel, Stat } from '@/components/workspace/ui';
import LeaveForm from '@/components/workspace/LeaveForm';
import LeaveList from '@/components/workspace/LeaveList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Leave' };

export default async function LeavePage() {
  const user = await requirePagePermission(P.LEAVE_REQUEST);

  await connectDB();
  const [balance, types, requests] = await Promise.all([
    getBalanceSummary({ user }),
    LeaveType.find({ active: true }).sort({ name: 1 }).lean(),
    LeaveRequest.find({ userId: user.id }).sort({ from: -1 }).limit(100).lean(),
  ]);

  // Only the types offered at this employee's office.
  const available = types.filter((t) => !t.offices?.length || t.offices.includes(user.office));
  const typeById = new Map(types.map((t) => [String(t._id), t]));

  return (
    <div className="ws-page">
      <PageHead title="Leave" lead={'Cycle ' + balance.cycle.label} />

      <div className="ws-grid ws-grid-4 mb-3">
        <Stat
          label="Paid leave left"
          value={formatDays(balance.remaining)}
          note={'of ' + formatDays(balance.quota + balance.carriedIn) + ' this cycle'}
        />
        <Stat label="Used" value={formatDays(balance.used)} />
        <Stat label="Awaiting approval" value={formatDays(balance.pending)} />
        <Stat
          label="Carry forward"
          value={
            balance.carryForwardMode === 'CARRY'
              ? 'Up to ' + formatDays(balance.maxCarryForward)
              : 'Lapses'
          }
          note={
            balance.overQuotaBehavior === 'BLOCK'
              ? 'Over quota is blocked'
              : 'Over quota becomes unpaid'
          }
        />
      </div>

      <Panel title="Apply for leave">
        {available.length === 0 ? (
          <p className="ws-muted mb-0">
            No leave types are available for your office yet. Ask the Owner to add one.
          </p>
        ) : (
          <LeaveForm
            leaveTypes={available.map((t) => ({
              id: String(t._id),
              name: t.name,
              paid: t.paid,
              allowHalfDay: t.allowHalfDay,
              requiresDocument: t.requiresDocument,
              documentAfterDays: t.documentAfterDays,
            }))}
            balance={{ remaining: formatDays(balance.remaining) }}
          />
        )}
      </Panel>

      <Panel title="My leave history">
        <LeaveList
          requests={requests.map((r) =>
            serializeLeaveRequest(r, { leaveType: typeById.get(String(r.leaveTypeId)) })
          )}
          canCancel
        />
      </Panel>
    </div>
  );
}
