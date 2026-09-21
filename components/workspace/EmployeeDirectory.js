'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiPost, issuesByField } from './api';
import { Person, TableWrap, Empty, formatDate } from './ui';

/**
 * The employee directory, and the one action that creates an account.
 *
 * A generated password is shown exactly once, in a modal with a copy button.
 * There is no route that can retrieve it again — only its bcrypt hash is
 * stored — so the modal says so plainly rather than letting the Owner assume
 * they can look it up later.
 */
export default function EmployeeDirectory({ users, departments, shifts }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState(null);

  return (
    <>
      <div className="d-flex justify-content-end mb-3">
        <button type="button" className="btn ws-btn-primary" onClick={() => setCreating(true)}>
          Add employee
        </button>
      </div>

      {users.length === 0 ? (
        <Empty title="No accounts yet">
          Add the first employee. They sign in with the Employee ID or email and the password you
          set.
        </Empty>
      ) : (
        <TableWrap label="Employee directory">
          <thead>
            <tr>
              <th scope="col">Employee</th>
              <th scope="col">Role</th>
              <th scope="col">Department</th>
              <th scope="col">Office</th>
              <th scope="col">Work mode</th>
              <th scope="col">Joined</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((person) => (
              <tr key={person.id}>
                <td>
                  <Link href={'/workspace/employees/' + person.id} className="text-decoration-none">
                    <Person name={person.name} meta={person.employeeId + ' · ' + person.email} />
                  </Link>
                </td>
                <td className="ws-muted">{person.roleLabel}</td>
                <td className="ws-muted">{person.department ?? '—'}</td>
                <td className="ws-muted">{person.office}</td>
                <td className="ws-muted">{titleCase(person.workMode)}</td>
                <td className="ws-muted">{formatDate(person.joiningDate)}</td>
                <td>
                  <span
                    className={
                      'ws-badge ws-badge-' + (person.status === 'ACTIVE' ? 'APPROVED' : 'REJECTED')
                    }
                  >
                    {person.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                  </span>
                  {!person.requiresAttendance && <span className="ws-flag ms-1">Exempt</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {creating && (
        <CreateEmployeeDialog
          departments={departments}
          shifts={shifts}
          onClose={() => setCreating(false)}
          onCreated={(result) => {
            setCreating(false);
            if (result.generatedPassword) {
              setCredentials({ user: result.user, password: result.generatedPassword });
            }
            router.refresh();
          }}
        />
      )}

      {credentials && (
        <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />
      )}
    </>
  );
}

function CreateEmployeeDialog({ departments, shifts, onClose, onCreated }) {
  const [form, setForm] = useState({
    employeeId: '',
    name: '',
    email: '',
    role: 'EMPLOYEE',
    designation: '',
    departmentId: '',
    office: 'ISLAMABAD',
    workMode: 'OFFICE',
    employmentType: 'PROBATION',
    joiningDate: new Date().toISOString().slice(0, 10),
    shiftId: shifts[0]?.id ?? '',
    phone: '',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setFieldErrors({});
    try {
      const body = { ...form };
      // Empty strings would fail validation; omit anything left blank.
      for (const key of Object.keys(body)) if (body[key] === '') delete body[key];
      const result = await apiPost('/api/workspace/employees', body);
      onCreated(result);
    } catch (err) {
      setError(err.message);
      setFieldErrors(issuesByField(err));
      setSaving(false);
    }
  };

  return (
    <div
      className="ws-modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="ws-modal" role="dialog" aria-modal="true" aria-labelledby="ws-create-title">
        <div className="ws-modal-head">
          <h2 className="ws-modal-title" id="ws-create-title">
            Add employee
          </h2>
        </div>

        <form onSubmit={submit}>
          <div className="ws-modal-body">
            {error && (
              <div className="alert alert-danger ws-alert" role="alert">
                {error}
              </div>
            )}

            <div className="row g-3">
              <Field
                label="Employee ID"
                name="employeeId"
                required
                value={form.employeeId}
                onChange={set}
                errors={fieldErrors}
                placeholder="LYR-0012"
                col="col-12 col-md-4"
              />
              <Field
                label="Full name"
                name="name"
                required
                value={form.name}
                onChange={set}
                errors={fieldErrors}
                col="col-12 col-md-8"
              />
              <Field
                label="Work email"
                name="email"
                type="email"
                required
                value={form.email}
                onChange={set}
                errors={fieldErrors}
                col="col-12 col-md-6"
              />
              <Field
                label="Phone"
                name="phone"
                value={form.phone}
                onChange={set}
                errors={fieldErrors}
                col="col-12 col-md-6"
              />

              <Select
                label="Role"
                name="role"
                value={form.role}
                onChange={set}
                col="col-12 col-md-4"
                options={[
                  { value: 'EMPLOYEE', label: 'Employee' },
                  { value: 'MD', label: 'Managing Director' },
                  { value: 'CEO', label: 'Chief Executive Officer' },
                ]}
              />
              <Field
                label="Designation"
                name="designation"
                value={form.designation}
                onChange={set}
                errors={fieldErrors}
                col="col-12 col-md-8"
              />

              <Select
                label="Department"
                name="departmentId"
                value={form.departmentId}
                onChange={set}
                col="col-12 col-md-4"
                options={[
                  { value: '', label: 'None' },
                  ...departments.map((d) => ({ value: d.id, label: d.name })),
                ]}
              />
              <Select
                label="Office"
                name="office"
                value={form.office}
                onChange={set}
                col="col-12 col-md-4"
                options={[
                  { value: 'ISLAMABAD', label: 'Islamabad' },
                  { value: 'DUBAI', label: 'Dubai' },
                ]}
              />
              <Select
                label="Work mode"
                name="workMode"
                value={form.workMode}
                onChange={set}
                col="col-12 col-md-4"
                options={[
                  { value: 'OFFICE', label: 'Office' },
                  { value: 'HYBRID', label: 'Hybrid' },
                  { value: 'REMOTE', label: 'Remote' },
                ]}
              />

              <Select
                label="Employment type"
                name="employmentType"
                value={form.employmentType}
                onChange={set}
                col="col-12 col-md-4"
                options={[
                  { value: 'PROBATION', label: 'Probation' },
                  { value: 'PERMANENT', label: 'Permanent' },
                  { value: 'CONTRACT', label: 'Contract' },
                  { value: 'INTERN', label: 'Intern' },
                ]}
              />
              <Field
                label="Joining date"
                name="joiningDate"
                type="date"
                value={form.joiningDate}
                onChange={set}
                errors={fieldErrors}
                col="col-12 col-md-4"
              />
              <Select
                label="Shift"
                name="shiftId"
                value={form.shiftId}
                onChange={set}
                col="col-12 col-md-4"
                options={[
                  { value: '', label: 'None' },
                  ...shifts.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />

              <div className="col-12">
                <label className="form-label ws-label" htmlFor="create-password">
                  Password
                </label>
                <input
                  id="create-password"
                  className="form-control"
                  type="text"
                  autoComplete="off"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="Leave blank to generate one"
                />
                <p className="form-text">
                  A generated password is shown once, here, and cannot be retrieved afterwards.
                </p>
                {fieldErrors.password && <p className="ws-field-error">{fieldErrors.password}</p>}
              </div>
            </div>
          </div>

          <div className="ws-modal-foot">
            <button type="button" className="btn ws-btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn ws-btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Shown once. There is no second chance to read this password. */
function CredentialsDialog({ credentials, onClose }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credentials.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="ws-modal-backdrop">
      <div className="ws-modal" role="dialog" aria-modal="true" aria-labelledby="ws-creds-title">
        <div className="ws-modal-head">
          <h2 className="ws-modal-title" id="ws-creds-title">
            Password for {credentials.user.name}
          </h2>
        </div>

        <div className="ws-modal-body">
          <div className="alert alert-warning ws-alert" role="alert">
            This is the only time this password is shown. Copy it now and give it to the employee —
            it cannot be retrieved afterwards, only reset.
          </div>

          <p className="ws-label-sm">Employee ID</p>
          <p className="ws-code mb-3">{credentials.user.employeeId}</p>

          <p className="ws-label-sm">Password</p>
          <p className="ws-code mb-3">{credentials.password}</p>

          <button type="button" className="btn ws-btn-ghost" onClick={copy}>
            {copied ? 'Copied' : 'Copy password'}
          </button>
        </div>

        <div className="ws-modal-foot">
          <button type="button" className="btn ws-btn-primary" onClick={onClose}>
            I have saved it
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  errors,
  required,
  type = 'text',
  placeholder,
  col = 'col-12',
}) {
  return (
    <div className={col}>
      <label
        className={'form-label ws-label' + (required ? ' ws-required' : '')}
        htmlFor={'f-' + name}
      >
        {label}
      </label>
      <input
        id={'f-' + name}
        className="form-control"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(name, e.target.value)}
      />
      {errors?.[name] && <p className="ws-field-error">{errors[name]}</p>}
    </div>
  );
}

function Select({ label, name, value, onChange, options, col = 'col-12' }) {
  return (
    <div className={col}>
      <label className="form-label ws-label" htmlFor={'f-' + name}>
        {label}
      </label>
      <select
        id={'f-' + name}
        className="form-select"
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function titleCase(value) {
  if (!value) return '—';
  return String(value)
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}
