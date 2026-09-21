import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import Office from '@/models/workspace/Office';
import { OFFICES, OFFICE_TIMEZONES } from '@/models/workspace/User';
import { PageHead } from '@/components/workspace/ui';
import OfficeSettings from '@/components/workspace/OfficeSettings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Offices' };

export default async function OfficesPage() {
  await requirePagePermission(P.SETTINGS_MANAGE);
  await connectDB();
  const saved = await Office.find({}).sort({ code: 1 }).lean();
  const byCode = new Map(saved.map((o) => [o.code, o]));

  // Both offices always render, whether or not they have been saved yet.
  const offices = OFFICES.map((code) => {
    const office = byCode.get(code);
    return office
      ? JSON.parse(JSON.stringify({ ...office, id: String(office._id) }))
      : {
          code,
          name: code === 'ISLAMABAD' ? 'Islamabad' : 'Dubai',
          timezone: OFFICE_TIMEZONES[code],
          weekendDays: code === 'DUBAI' ? [6, 7] : [7],
          ipAllowlist: [],
          geofence: { lat: null, lng: null, radiusM: 200 },
        };
  });

  return (
    <div className="ws-page">
      <PageHead
        title="Offices"
        lead="The timezone each office is measured in, its weekend, and the checks applied when people clock in."
      />

      <div className="alert alert-info ws-alert" role="note">
        Leave quotas, working-hour limits and overtime rates differ between Pakistan and the UAE.
        Confirm the leave and working-hour policies with your HR or legal advisor for each office.
      </div>

      <OfficeSettings offices={offices} />
    </div>
  );
}
