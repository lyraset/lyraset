import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import Department from '@/models/workspace/Department';
import { PageHead, Panel } from '@/components/workspace/ui';
import SettingsCrud from '@/components/workspace/SettingsCrud';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Departments' };

export default async function DepartmentsPage() {
  await requirePagePermission(P.SETTINGS_MANAGE);
  await connectDB();
  const departments = await Department.find({}).sort({ name: 1 }).lean();

  return (
    <div className="ws-page">
      <PageHead
        title="Departments"
        lead="Used on profiles, and to filter the team sheet and every report."
      />
      <Panel>
        <SettingsCrud
          endpoint="/api/workspace/settings/departments"
          collectionKey="Departments"
          addLabel="Add department"
          emptyTitle="No departments yet"
          emptyBody="Add the first one below. You can assign people to it from their profile."
          items={departments.map((d) => ({
            id: String(d._id),
            name: d.name,
            active: d.active,
            display: { active: d.active ? 'Active' : 'Retired' },
          }))}
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'active', label: 'Status' },
          ]}
          fields={[
            { name: 'name', label: 'Name', required: true, col: 'col-12 col-md-6' },
            {
              name: 'active',
              label: 'Active',
              type: 'checkbox',
              default: true,
              col: 'col-12 col-md-3',
            },
          ]}
        />
      </Panel>
    </div>
  );
}
