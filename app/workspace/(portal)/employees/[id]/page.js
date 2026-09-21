import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePagePermission } from '@/lib/workspace/auth';
import { P, ROLE_LABELS, canManageAccount } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import User, { toProfileUser } from '@/models/workspace/User';
import Department from '@/models/workspace/Department';
import Shift from '@/models/workspace/Shift';
import ShiftAssignment from '@/models/workspace/ShiftAssignment';
import { maskStoredField } from '@/lib/workspace/crypto';
import { PageHead, Panel, formatDate } from '@/components/workspace/ui';
import EmployeeProfile from '@/components/workspace/EmployeeProfile';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  await connectDB();
  const person = await User.findById(id)
    .select('name')
    .lean()
    .catch(() => null);
  return { title: person?.name ?? 'Employee' };
}

export default async function EmployeeDetailPage({ params }) {
  const actor = await requirePagePermission(P.EMPLOYEES_MANAGE);
  const { id } = await params;

  await connectDB();
  const found = await User.findById(id)
    .select('+nationalId')
    .lean()
    .catch(() => null);
  if (!found) notFound();

  const [departments, shifts, assignments] = await Promise.all([
    Department.find({ active: true }).sort({ name: 1 }).lean(),
    Shift.find({ active: true }).sort({ name: 1 }).lean(),
    ShiftAssignment.find({ userId: found._id }).sort({ effectiveFrom: -1 }).limit(10).lean(),
  ]);

  const profile = toProfileUser(found);
  const shiftName = new Map(shifts.map((s) => [String(s._id), s.name]));
  const canManage = canManageAccount(actor, { role: found.role, id: String(found._id) });

  return (
    <div className="ws-page">
      <PageHead
        title={profile.name}
        lead={profile.employeeId + ' · ' + ROLE_LABELS[profile.role] + ' · ' + profile.office}
        actions={
          <Link href={'/workspace/team/' + profile.id} className="btn ws-btn-ghost ws-btn-sm">
            View attendance
          </Link>
        }
      />

      <EmployeeProfile
        profile={profile}
        departments={departments.map((d) => ({ id: String(d._id), name: d.name }))}
        shifts={shifts.map((s) => ({ id: String(s._id), name: s.name }))}
        canManage={canManage}
        nationalIdMasked={maskStoredField(found.nationalId)}
      />

      {assignments.length > 0 && (
        <Panel title="Shift history">
          <dl className="ws-kv mb-0">
            {assignments.map((assignment) => (
              <div key={String(assignment._id)} style={{ display: 'contents' }}>
                <dt>{shiftName.get(String(assignment.shiftId)) ?? 'Shift'}</dt>
                <dd>
                  From {formatDate(assignment.effectiveFrom)}
                  {assignment.effectiveTo
                    ? ' to ' + formatDate(assignment.effectiveTo)
                    : ' (current)'}
                </dd>
              </div>
            ))}
          </dl>
          <p className="ws-faint mt-2 mb-0" style={{ fontSize: '0.82rem' }}>
            Changing the shift adds a new dated assignment rather than editing the old one, so past
            days keep the hours they were actually measured against.
          </p>
        </Panel>
      )}
    </div>
  );
}
