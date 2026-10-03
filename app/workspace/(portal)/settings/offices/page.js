import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import Office from '@/models/workspace/Office';
import { OFFICES } from '@/models/workspace/User';
import { PageHead } from '@/components/workspace/ui';
import OfficeSettings from '@/components/workspace/OfficeSettings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Office' };

export default async function OfficesPage() {
  await requirePagePermission(P.SETTINGS_MANAGE);
  await connectDB();
  const saved = await Office.find({}).sort({ code: 1 }).lean();
  const byCode = new Map(saved.map((o) => [o.code, o]));

  // The office always renders, whether or not it has been saved yet.
  const offices = OFFICES.map((code) => {
    const office = byCode.get(code);
    return office
      ? JSON.parse(JSON.stringify({ ...office, id: String(office._id) }))
      : {
          code,
          name: 'Islamabad',
          weekendDays: [7],
          ipAllowlist: [],
          geofence: { lat: null, lng: null, radiusM: 200 },
        };
  });

  return (
    <div className="ws-page">
      <PageHead
        title="Office"
        lead="The weekend, and the checks applied when people clock in. Every time in the portal is Pakistan time."
      />

      <div className="alert alert-info ws-alert" role="note">
        Confirm leave quotas, working-hour limits and overtime rates with your HR or legal advisor.
      </div>

      <OfficeSettings offices={offices} />
    </div>
  );
}
