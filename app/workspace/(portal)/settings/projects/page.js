import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import Project from '@/models/workspace/Project';
import { PageHead, Panel } from '@/components/workspace/ui';
import SettingsCrud from '@/components/workspace/SettingsCrud';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Clients & projects' };

export default async function ProjectsPage() {
  await requirePagePermission(P.SETTINGS_MANAGE);
  await connectDB();
  const projects = await Project.find({}).sort({ client: 1, name: 1 }).lean();

  return (
    <div className="ws-page">
      <PageHead
        title="Clients & projects"
        lead="What EOD tasks are filed against. Tagging tasks is what makes a per-client work log possible."
      />
      <Panel>
        <SettingsCrud
          endpoint="/api/workspace/settings/projects"
          collectionKey="Projects"
          addLabel="Add project"
          emptyTitle="No projects yet"
          emptyBody="Add a client project. Employees can always pick Internal / Other instead."
          items={projects.map((p) => ({
            id: String(p._id),
            name: p.name,
            client: p.client ?? '',
            active: p.active,
          }))}
          columns={[
            { key: 'client', label: 'Client', render: (item) => item.client || 'Internal' },
            { key: 'name', label: 'Project' },
            {
              key: 'active',
              label: 'Status',
              render: (item) => (item.active ? 'Active' : 'Retired'),
            },
          ]}
          fields={[
            { name: 'client', label: 'Client', nullable: true, col: 'col-12 col-md-4' },
            { name: 'name', label: 'Project', required: true, col: 'col-12 col-md-4' },
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
