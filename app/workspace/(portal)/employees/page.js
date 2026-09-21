import { requirePagePermission } from '@/lib/workspace/auth';
import { P, ROLE_LABELS } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import User, { toSafeUser } from '@/models/workspace/User';
import Department from '@/models/workspace/Department';
import Shift from '@/models/workspace/Shift';
import { escapeRegex } from '@/lib/workspace/validation';
import { PageHead, Panel, Stat } from '@/components/workspace/ui';
import Filters from '@/components/workspace/Filters';
import EmployeeDirectory from '@/components/workspace/EmployeeDirectory';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Employees' };

export default async function EmployeesPage({ searchParams }) {
  await requirePagePermission(P.EMPLOYEES_MANAGE);
  const sp = (await searchParams) ?? {};

  await connectDB();
  const find = {};
  if (typeof sp.office === 'string') find.office = sp.office;
  if (typeof sp.status === 'string') find.status = sp.status;
  if (typeof sp.departmentId === 'string') find.departmentId = sp.departmentId;
  if (typeof sp.q === 'string' && sp.q.trim()) {
    const safe = escapeRegex(sp.q.trim());
    find.$or = [
      { name: { $regex: safe, $options: 'i' } },
      { employeeId: { $regex: safe, $options: 'i' } },
      { email: { $regex: safe, $options: 'i' } },
    ];
  }

  const [users, departments, shifts, counts] = await Promise.all([
    User.find(find).sort({ status: 1, name: 1 }).lean(),
    Department.find({ active: true }).sort({ name: 1 }).lean(),
    Shift.find({ active: true }).sort({ name: 1 }).lean(),
    Promise.all([
      User.countDocuments({ status: 'ACTIVE' }),
      User.countDocuments({ status: 'INACTIVE' }),
      User.countDocuments({ status: 'ACTIVE', employmentType: 'PROBATION' }),
    ]),
  ]);

  return (
    <div className="ws-page">
      <PageHead
        title="Employees"
        lead="Every account, including the MD and the CEO. There is no sign-up — you create each one here."
      />

      <div className="ws-grid ws-grid-3 mb-3">
        <Stat label="Active" value={counts[0]} />
        <Stat label="Inactive" value={counts[1]} note="History kept, sign-in blocked" />
        <Stat label="On probation" value={counts[2]} />
      </div>

      <Panel>
        <Filters
          fields={[
            { name: 'q', label: 'Search', placeholder: 'Name, ID or email' },
            {
              name: 'office',
              label: 'Office',
              type: 'select',
              options: [
                { value: 'ISLAMABAD', label: 'Islamabad' },
                { value: 'DUBAI', label: 'Dubai' },
              ],
            },
            {
              name: 'departmentId',
              label: 'Department',
              type: 'select',
              options: departments.map((d) => ({ value: String(d._id), label: d.name })),
            },
            {
              name: 'status',
              label: 'Status',
              type: 'select',
              options: [
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive' },
              ],
            },
          ]}
        />

        <EmployeeDirectory
          users={users.map((u) => ({ ...toSafeUser(u), roleLabel: ROLE_LABELS[u.role] }))}
          departments={departments.map((d) => ({ id: String(d._id), name: d.name }))}
          shifts={shifts.map((s) => ({ id: String(s._id), name: s.name }))}
        />
      </Panel>
    </div>
  );
}
