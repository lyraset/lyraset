import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import WorkRequest from '@/models/workspace/WorkRequest';
import { serializeRequest } from '@/lib/workspace/services/requests';
import { PageHead, Panel } from '@/components/workspace/ui';
import RequestForm from '@/components/workspace/RequestForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Requests' };

export default async function RequestsPage() {
  const user = await requirePagePermission(P.REQUEST_SUBMIT);

  await connectDB();
  const requests = await WorkRequest.find({ userId: user.id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return (
    <div className="ws-page">
      <PageHead
        title="Requests"
        lead="Corrections, work from home, official duty and overtime claims. The Owner or the CEO decides each one."
      />
      <Panel>
        <RequestForm requests={requests.map((r) => serializeRequest(r))} />
      </Panel>
    </div>
  );
}
