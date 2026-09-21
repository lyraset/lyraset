import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import SpecialSchedule from '@/models/workspace/SpecialSchedule';
import { PageHead, Panel, formatDate } from '@/components/workspace/ui';
import ScheduleOverrides from '@/components/workspace/ScheduleOverrides';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Date overrides' };

export default async function SchedulesPage() {
  await requirePagePermission(P.SETTINGS_MANAGE);
  await connectDB();
  const schedules = await SpecialSchedule.find({}).sort({ from: -1 }).lean();

  return (
    <div className="ws-page">
      <PageHead
        title="Date overrides"
        lead="Ramadan timings, a one-off early close, anything that changes the hours for a range of dates."
      />
      <Panel>
        <ScheduleOverrides
          schedules={schedules.map((s) => ({
            id: String(s._id),
            name: s.name,
            from: s.from,
            to: s.to,
            offices: s.offices ?? [],
            days: JSON.parse(JSON.stringify(s.days ?? {})),
            note: s.note ?? '',
            active: s.active,
            summary: formatDate(s.from) + ' to ' + formatDate(s.to),
          }))}
        />
      </Panel>
      <p className="ws-faint" style={{ fontSize: '0.82rem' }}>
        An override only changes the days you fill in, and only the fields you set on them — giving
        just an end time shifts the close and leaves the start and break alone.
      </p>
    </div>
  );
}
