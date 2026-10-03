import { requirePagePermission } from '@/lib/workspace/auth';
import { P, ROLE_LABELS } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import User, { toProfileUser } from '@/models/workspace/User';
import ShiftAssignment from '@/models/workspace/ShiftAssignment';
import Shift from '@/models/workspace/Shift';
import { getWorkspaceContext, scheduleFor, officeFor } from '@/lib/workspace/context';
import { maskStoredField } from '@/lib/workspace/crypto';
import { formatDuration } from '@/lib/workspace/calc/attendance';
import { TIMEZONE_LABEL } from '@/lib/workspace/timezone';
import { PageHead, Panel, formatDate } from '@/components/workspace/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My profile' };

/**
 * The employee's own HR record, read-only.
 *
 * Employees never edit their own details — the Owner keeps the record, which
 * is what makes it usable as an HR file. The national ID is shown masked even
 * to the person it belongs to, because the plaintext has no reason to leave
 * the database.
 */
export default async function ProfilePage() {
  const user = await requirePagePermission(P.PROFILE_VIEW_OWN);

  await connectDB();
  const found = await User.findById(user.id).select('+nationalId').lean();
  const profile = toProfileUser(found);

  const ctx = await getWorkspaceContext();
  const office = officeFor(ctx, found.office);
  const schedule = scheduleFor(ctx, { ...found, id: user.id }, new Date());

  const [assignments, shifts] = await Promise.all([
    ShiftAssignment.find({ userId: user.id }).sort({ effectiveFrom: -1 }).limit(10).lean(),
    Shift.find({}).select('name').lean(),
  ]);
  const shiftName = new Map(shifts.map((s) => [String(s._id), s.name]));
  const masked = maskStoredField(found.nationalId);

  return (
    <div className="ws-page">
      <PageHead
        title="My profile"
        lead="Your HR record. The Owner keeps it up to date — tell them if anything here is wrong."
      />

      <div className="ws-grid ws-grid-2">
        <Panel title="Employment">
          <dl className="ws-kv mb-0">
            <dt>Employee ID</dt>
            <dd className="ws-mono">{profile.employeeId}</dd>
            <dt>Role</dt>
            <dd>{ROLE_LABELS[profile.role]}</dd>
            <dt>Designation</dt>
            <dd>{profile.designation ?? '—'}</dd>
            <dt>Department</dt>
            <dd>{profile.department ?? '—'}</dd>
            <dt>Office</dt>
            <dd>
              {office.name} · {TIMEZONE_LABEL}
            </dd>
            <dt>Work mode</dt>
            <dd>{titleCase(profile.workMode)}</dd>
            <dt>Employment type</dt>
            <dd>{titleCase(profile.employmentType)}</dd>
            <dt>Joined</dt>
            <dd>{formatDate(profile.joiningDate)}</dd>
            {profile.probationEnd && (
              <>
                <dt>Probation ends</dt>
                <dd>{formatDate(profile.probationEnd)}</dd>
              </>
            )}
            {profile.confirmationDate && (
              <>
                <dt>Confirmed</dt>
                <dd>{formatDate(profile.confirmationDate)}</dd>
              </>
            )}
            <dt>Status</dt>
            <dd>{titleCase(profile.status)}</dd>
          </dl>
        </Panel>

        <Panel title="Personal">
          <dl className="ws-kv mb-0">
            <dt>Full name</dt>
            <dd>{profile.name}</dd>
            <dt>Work email</dt>
            <dd>{profile.email}</dd>
            <dt>Personal email</dt>
            <dd>{profile.personalEmail ?? '—'}</dd>
            <dt>Phone</dt>
            <dd>{profile.phone ?? '—'}</dd>
            <dt>Date of birth</dt>
            <dd>{formatDate(profile.dateOfBirth)}</dd>
            <dt>Address</dt>
            <dd>{profile.address ?? '—'}</dd>
            <dt>Emergency contact</dt>
            <dd>
              {profile.emergencyContact?.name
                ? profile.emergencyContact.name +
                  (profile.emergencyContact.relation
                    ? ' (' + profile.emergencyContact.relation + ')'
                    : '') +
                  (profile.emergencyContact.phone ? ' · ' + profile.emergencyContact.phone : '')
                : '—'}
            </dd>
            {masked && (
              <>
                <dt>National ID</dt>
                <dd className="ws-mono">{masked}</dd>
              </>
            )}
          </dl>
        </Panel>
      </div>

      <Panel title="My schedule">
        <p className="ws-muted">
          {schedule.working
            ? 'Today you work ' +
              schedule.start +
              ' to ' +
              schedule.end +
              ', with ' +
              schedule.breakMinutes +
              ' minutes of break — ' +
              formatDuration(schedule.requiredMinutes) +
              ' required.'
            : 'Today is not a working day for you.'}
          {schedule.flexible
            ? ' Your shift is flexible, so only the daily minutes count and there is no late marking.'
            : ' You have ' + schedule.graceMinutes + ' minutes of grace after the start time.'}
        </p>

        {assignments.length > 0 && (
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
        )}
      </Panel>

      {(office.enforceGeofence || office.enforceIpAllowlist) && (
        <Panel title="What is recorded when you clock in">
          <ul className="ws-muted mb-0">
            <li>The time, stamped by the server — never by your device.</li>
            <li>Your IP address.</li>
            {office.enforceGeofence && <li>Your location, to confirm you are at the office.</li>}
          </ul>
          {office.policyNote && <p className="ws-faint mt-2 mb-0">{office.policyNote}</p>}
        </Panel>
      )}

      {profile.documents.length > 0 && (
        <Panel title="Documents on file">
          <p className="ws-muted mb-0">
            {profile.documents.length} document(s) are held on your record. They are stored
            privately and only the Owner can open them.
          </p>
        </Panel>
      )}
    </div>
  );
}

function titleCase(value) {
  if (!value) return '—';
  return String(value)
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}
