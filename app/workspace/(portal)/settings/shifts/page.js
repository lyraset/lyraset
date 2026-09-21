import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import Shift from '@/models/workspace/Shift';
import { PageHead, Panel } from '@/components/workspace/ui';
import ShiftBuilder from '@/components/workspace/ShiftBuilder';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shifts' };

export default async function ShiftsPage() {
  await requirePagePermission(P.SETTINGS_MANAGE);
  await connectDB();
  const shifts = await Shift.find({}).sort({ name: 1 }).lean();

  return (
    <div className="ws-page">
      <PageHead
        title="Shifts"
        lead="A shift is a weekly schedule, day by day. Assign one to each employee from their profile."
      />
      <Panel>
        <ShiftBuilder
          shifts={shifts.map((s) => ({
            id: String(s._id),
            name: s.name,
            graceMinutes: s.graceMinutes,
            flexible: s.flexible,
            isDefault: s.isDefault,
            active: s.active,
            days: JSON.parse(JSON.stringify(s.days ?? {})),
          }))}
        />
      </Panel>
      <p className="ws-faint" style={{ fontSize: '0.82rem' }}>
        Required minutes are end minus start minus the break, so a short Saturday is a full working
        day that simply requires less. An end earlier than the start runs past midnight, and the
        record still belongs to the date the shift started.
      </p>
    </div>
  );
}
