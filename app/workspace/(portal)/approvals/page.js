import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import LeaveType from '@/models/workspace/LeaveType';
import { pendingApprovals } from '@/lib/workspace/services/requests';
import { serializeLeaveRequest } from '@/lib/workspace/services/leave';
import { PageHead, Panel, Stat } from '@/components/workspace/ui';
import Filters from '@/components/workspace/Filters';
import ApprovalsInbox from '@/components/workspace/ApprovalsInbox';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Approvals' };

export default async function ApprovalsPage({ searchParams }) {
  const approver = await requirePagePermission(P.APPROVALS_MANAGE);
  const sp = (await searchParams) ?? {};
  const type = typeof sp.type === 'string' ? sp.type : null;

  await connectDB();
  const [{ requests, leaves, usersById }, types] = await Promise.all([
    pendingApprovals({ approver, type }),
    LeaveType.find({}).lean(),
  ]);
  const typeById = new Map(types.map((t) => [String(t._id), t]));

  const serializedLeaves = leaves.map((l) =>
    serializeLeaveRequest(l, {
      leaveType: typeById.get(String(l.leaveTypeId)),
      requester: usersById.get(String(l.userId)),
    })
  );

  return (
    <div className="ws-page">
      <PageHead
        title="Approvals"
        lead="Everything waiting on a decision. Your own requests never appear here."
      />

      <div className="ws-grid ws-grid-3 mb-3">
        <Stat label="Leave applications" value={serializedLeaves.length} />
        <Stat label="Other requests" value={requests.length} />
        <Stat label="Total" value={serializedLeaves.length + requests.length} />
      </div>

      <Panel>
        <Filters
          fields={[
            {
              name: 'type',
              label: 'Type',
              type: 'select',
              options: [
                { value: 'LEAVE', label: 'Leave' },
                { value: 'CORRECTION', label: 'Corrections' },
                { value: 'WFH', label: 'Work from home' },
                { value: 'OFFICIAL_DUTY', label: 'Official duty' },
                { value: 'OVERTIME', label: 'Overtime' },
              ],
            },
          ]}
        />
        <ApprovalsInbox leaves={serializedLeaves} requests={requests} filterType={type} />
      </Panel>
    </div>
  );
}
