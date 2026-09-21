import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import Holiday from '@/models/workspace/Holiday';
import { PageHead, Panel, formatDate } from '@/components/workspace/ui';
import SettingsCrud from '@/components/workspace/SettingsCrud';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Holidays' };

export default async function HolidaysPage() {
  await requirePagePermission(P.SETTINGS_MANAGE);
  await connectDB();
  const holidays = await Holiday.find({}).sort({ date: -1 }).limit(200).lean();

  return (
    <div className="ws-page">
      <PageHead
        title="Holidays"
        lead="Per office, or for everyone. Adding one recalculates that day for anyone whose period is still open."
      />

      <div className="alert alert-info ws-alert" role="note">
        Moon-dependent dates such as Eid often move at short notice. Adding or moving a holiday is
        safe at any time: days inside a locked payroll period are left alone, everything else is
        recalculated.
      </div>

      <Panel>
        <SettingsCrud
          endpoint="/api/workspace/settings/holidays"
          collectionKey="Holidays"
          addLabel="Add holiday"
          emptyTitle="No holidays yet"
          emptyBody="Add the public holidays for each office so those days are never marked absent."
          hardDelete
          items={holidays.map((h) => ({
            id: String(h._id),
            date: h.date,
            name: h.name,
            offices: h.offices ?? [],
            isClosure: h.isClosure,
            note: h.note ?? '',
          }))}
          columns={[
            {
              key: 'date',
              label: 'Date',
              render: (item) => formatDate(item.date, { weekday: true }),
            },
            { key: 'name', label: 'Name' },
            {
              key: 'offices',
              label: 'Offices',
              render: (item) => (item.offices?.length ? item.offices.join(', ') : 'All'),
            },
            {
              key: 'isClosure',
              label: 'Type',
              render: (item) => (item.isClosure ? 'Office closure' : 'Public holiday'),
            },
            { key: 'note', label: 'Note', wrap: true, render: (item) => item.note || '—' },
          ]}
          fields={[
            { name: 'date', label: 'Date', type: 'date', required: true, col: 'col-12 col-md-3' },
            {
              name: 'name',
              label: 'Name',
              required: true,
              placeholder: 'Eid al-Fitr',
              col: 'col-12 col-md-4',
            },
            {
              name: 'offices',
              label: 'Applies to',
              type: 'multiselect',
              options: [
                { value: 'ISLAMABAD', label: 'Islamabad' },
                { value: 'DUBAI', label: 'Dubai' },
              ],
              hint: 'None selected means every office.',
              col: 'col-12 col-md-2',
            },
            {
              name: 'isClosure',
              label: 'One-off office closure',
              type: 'checkbox',
              col: 'col-12 col-md-3',
            },
            { name: 'note', label: 'Note', nullable: true, col: 'col-12 col-md-6' },
          ]}
        />
      </Panel>
    </div>
  );
}
