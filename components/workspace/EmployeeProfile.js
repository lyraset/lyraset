'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPatch, apiPost, apiDelete, uploadPrivateFile, assetUrl, issuesByField } from './api';
import { Panel, Empty, formatDate } from './ui';

/**
 * The Owner's view of one employee: the HR record, the account actions, and
 * the private documents.
 *
 * Owner accounts are deliberately unmanageable from here — `canManageAccount`
 * refuses them server-side, and this hides the controls so the Owner is not
 * offered a button that will only ever fail.
 */

const DOCUMENT_TYPES = [
  { value: 'CV', label: 'CV' },
  { value: 'OFFER_LETTER', label: 'Offer letter' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'ID_COPY', label: 'ID copy' },
  { value: 'DEGREE', label: 'Degree' },
  { value: 'OTHER', label: 'Other' },
];

export default function EmployeeProfile({
  profile,
  departments,
  shifts,
  canManage,
  nationalIdMasked,
}) {
  const router = useRouter();
  const [form, setForm] = useState(() => ({
    name: profile.name ?? '',
    email: profile.email ?? '',
    role: profile.role,
    designation: profile.designation ?? '',
    departmentId: profile.departmentId ?? '',
    workMode: profile.workMode,
    employmentType: profile.employmentType,
    joiningDate: dateInput(profile.joiningDate),
    probationEnd: dateInput(profile.probationEnd),
    confirmationDate: dateInput(profile.confirmationDate),
    shiftId: profile.shiftId ?? '',
    phone: profile.phone ?? '',
    personalEmail: profile.personalEmail ?? '',
    dateOfBirth: dateInput(profile.dateOfBirth),
    address: profile.address ?? '',
    emergencyName: profile.emergencyContact?.name ?? '',
    emergencyRelation: profile.emergencyContact?.relation ?? '',
    emergencyPhone: profile.emergencyContact?.phone ?? '',
    nationalId: '',
  }));

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [action, setAction] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [documents, setDocuments] = useState(profile.documents ?? []);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('CV');

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    setFieldErrors({});
    try {
      const body = {
        name: form.name,
        email: form.email,
        role: form.role,
        designation: form.designation || null,
        departmentId: form.departmentId || null,
        workMode: form.workMode,
        employmentType: form.employmentType,
        joiningDate: form.joiningDate || null,
        probationEnd: form.probationEnd || null,
        confirmationDate: form.confirmationDate || null,
        shiftId: form.shiftId || null,
        phone: form.phone || null,
        personalEmail: form.personalEmail || '',
        dateOfBirth: form.dateOfBirth || null,
        address: form.address || null,
        emergencyContact: {
          name: form.emergencyName || null,
          relation: form.emergencyRelation || null,
          phone: form.emergencyPhone || null,
        },
      };
      // Only send the ID number when it was actually typed, so saving the form
      // does not wipe a stored value the Owner never looked at.
      if (form.nationalId.trim()) body.nationalId = form.nationalId.trim();

      const result = await apiPatch('/api/workspace/employees/' + profile.id, body);
      setSaved(true);
      set('nationalId', '');
      if (result.signedOut) {
        setError('');
      }
      router.refresh();
    } catch (err) {
      setError(err.message);
      setFieldErrors(issuesByField(err));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (kind, body = {}) => {
    setAction(kind);
    setError('');
    try {
      if (kind === 'password') {
        const result = await apiPost('/api/workspace/employees/' + profile.id + '/password', {});
        if (result.password) setCredentials(result.password);
      } else if (kind === 'unlock') {
        await apiPost('/api/workspace/employees/' + profile.id + '/unlock', {});
      } else if (kind === 'logout') {
        await apiPost('/api/workspace/employees/' + profile.id + '/force-logout', {});
      } else if (kind === 'status') {
        await apiPost('/api/workspace/employees/' + profile.id + '/status', body);
      }
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setAction(null);
    }
  };

  const onDocument = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const asset = await uploadPrivateFile(file, 'DOCUMENT');
      const result = await apiPost('/api/workspace/employees/' + profile.id + '/documents', {
        type: docType,
        label: file.name,
        asset,
      });
      setDocuments(result.documents);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const removeDocument = async (documentId) => {
    setError('');
    try {
      const result = await apiDelete(
        '/api/workspace/employees/' + profile.id + '/documents?documentId=' + documentId
      );
      setDocuments(result.documents);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!canManage) {
    return (
      <Panel title="Account protected">
        <p className="ws-muted mb-0">
          Owner accounts cannot be changed from the portal — that is what stops a mistake here from
          locking everyone out. Use{' '}
          <span className="ws-mono">scripts/create-owner.mjs --reset</span> to issue a new Owner
          password.
        </p>
      </Panel>
    );
  }

  return (
    <>
      {error && (
        <div className="alert alert-danger ws-alert" role="alert">
          {error}
        </div>
      )}
      {saved && (
        <div className="alert alert-success ws-alert" role="status">
          Profile saved.
        </div>
      )}

      <Panel title="Account actions">
        <div className="d-flex gap-2 flex-wrap">
          <button
            type="button"
            className="btn ws-btn-ghost"
            onClick={() => runAction('password')}
            disabled={action === 'password'}
          >
            {action === 'password' ? 'Resetting…' : 'Reset password'}
          </button>
          <button
            type="button"
            className="btn ws-btn-ghost"
            onClick={() => runAction('unlock')}
            disabled={action === 'unlock'}
          >
            {action === 'unlock' ? 'Unlocking…' : 'Unlock account'}
          </button>
          <button
            type="button"
            className="btn ws-btn-ghost"
            onClick={() => runAction('logout')}
            disabled={action === 'logout'}
          >
            {action === 'logout' ? 'Signing out…' : 'Force sign-out'}
          </button>
          {profile.status === 'ACTIVE' ? (
            <button
              type="button"
              className="btn ws-btn-danger"
              onClick={() => runAction('status', { status: 'INACTIVE', exitType: 'RESIGNED' })}
              disabled={action === 'status'}
            >
              Deactivate
            </button>
          ) : (
            <button
              type="button"
              className="btn ws-btn-ghost"
              onClick={() => runAction('status', { status: 'ACTIVE' })}
              disabled={action === 'status'}
            >
              Reactivate
            </button>
          )}
        </div>
        <p className="ws-faint mt-2 mb-0" style={{ fontSize: '0.82rem' }}>
          Resetting a password, changing a role and deactivating all end every session this account
          has open. Nothing is ever deleted — a deactivated account keeps its whole history.
        </p>
      </Panel>

      <form onSubmit={save}>
        <Panel title="Employment">
          <div className="row g-3">
            <Field
              col="col-12 col-md-6"
              label="Full name"
              name="name"
              value={form.name}
              set={set}
              errors={fieldErrors}
              required
            />
            <Field
              col="col-12 col-md-6"
              label="Work email"
              name="email"
              type="email"
              value={form.email}
              set={set}
              errors={fieldErrors}
              required
            />
            <Select
              col="col-12 col-md-4"
              label="Role"
              name="role"
              value={form.role}
              set={set}
              options={[
                { value: 'EMPLOYEE', label: 'Employee' },
                { value: 'MD', label: 'Managing Director' },
                { value: 'CEO', label: 'Chief Executive Officer' },
              ]}
            />
            <Field
              col="col-12 col-md-8"
              label="Designation"
              name="designation"
              value={form.designation}
              set={set}
              errors={fieldErrors}
            />
            <Select
              col="col-12 col-md-6"
              label="Department"
              name="departmentId"
              value={form.departmentId}
              set={set}
              options={[
                { value: '', label: 'None' },
                ...departments.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
            <Select
              col="col-12 col-md-6"
              label="Work mode"
              name="workMode"
              value={form.workMode}
              set={set}
              options={[
                { value: 'OFFICE', label: 'Office' },
                { value: 'HYBRID', label: 'Hybrid' },
                { value: 'REMOTE', label: 'Remote' },
              ]}
            />
            <Select
              col="col-12 col-md-4"
              label="Employment type"
              name="employmentType"
              value={form.employmentType}
              set={set}
              options={[
                { value: 'PROBATION', label: 'Probation' },
                { value: 'PERMANENT', label: 'Permanent' },
                { value: 'CONTRACT', label: 'Contract' },
                { value: 'INTERN', label: 'Intern' },
              ]}
            />
            <Select
              col="col-12 col-md-4"
              label="Shift"
              name="shiftId"
              value={form.shiftId}
              set={set}
              options={[
                { value: '', label: 'None' },
                ...shifts.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            <Field
              col="col-12 col-md-4"
              label="Joining date"
              name="joiningDate"
              type="date"
              value={form.joiningDate}
              set={set}
              errors={fieldErrors}
            />
            <Field
              col="col-12 col-md-4"
              label="Probation ends"
              name="probationEnd"
              type="date"
              value={form.probationEnd}
              set={set}
              errors={fieldErrors}
            />
            <Field
              col="col-12 col-md-4"
              label="Confirmed on"
              name="confirmationDate"
              type="date"
              value={form.confirmationDate}
              set={set}
              errors={fieldErrors}
            />
          </div>
        </Panel>

        <Panel title="Personal">
          <div className="row g-3">
            <Field
              col="col-12 col-md-4"
              label="Phone"
              name="phone"
              value={form.phone}
              set={set}
              errors={fieldErrors}
            />
            <Field
              col="col-12 col-md-4"
              label="Personal email"
              name="personalEmail"
              type="email"
              value={form.personalEmail}
              set={set}
              errors={fieldErrors}
            />
            <Field
              col="col-12 col-md-4"
              label="Date of birth"
              name="dateOfBirth"
              type="date"
              value={form.dateOfBirth}
              set={set}
              errors={fieldErrors}
            />
            <Field
              col="col-12"
              label="Address"
              name="address"
              value={form.address}
              set={set}
              errors={fieldErrors}
            />
            <Field
              col="col-12 col-md-4"
              label="Emergency contact"
              name="emergencyName"
              value={form.emergencyName}
              set={set}
              errors={fieldErrors}
            />
            <Field
              col="col-12 col-md-4"
              label="Relation"
              name="emergencyRelation"
              value={form.emergencyRelation}
              set={set}
              errors={fieldErrors}
            />
            <Field
              col="col-12 col-md-4"
              label="Emergency phone"
              name="emergencyPhone"
              value={form.emergencyPhone}
              set={set}
              errors={fieldErrors}
            />

            <div className="col-12 col-md-6">
              <label className="form-label ws-label" htmlFor="f-nationalId">
                National ID (CNIC, Emirates ID)
              </label>
              <input
                id="f-nationalId"
                className="form-control"
                value={form.nationalId}
                onChange={(e) => set('nationalId', e.target.value)}
                placeholder={nationalIdMasked ? 'Stored as ' + nationalIdMasked : 'Not stored'}
                autoComplete="off"
              />
              <p className="form-text">
                Encrypted at rest and only ever shown masked. Leave blank to keep what is stored.
              </p>
            </div>
          </div>
        </Panel>

        <div className="mb-4">
          <button type="submit" className="btn ws-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>

      <Panel title="Documents">
        <div className="row g-2 align-items-end mb-3">
          <div className="col-12 col-md-4">
            <label className="form-label ws-label" htmlFor="doc-type">
              Document type
            </label>
            <select
              id="doc-type"
              className="form-select"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              {DOCUMENT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-8">
            <label className="form-label ws-label" htmlFor="doc-file">
              Upload
            </label>
            <input
              id="doc-file"
              type="file"
              className="form-control"
              onChange={onDocument}
              disabled={uploading}
            />
          </div>
        </div>

        {uploading && <p className="ws-muted">Uploading…</p>}

        {documents.length === 0 ? (
          <Empty title="No documents yet">
            CVs, offer letters, contracts and ID copies are stored privately and only you can open
            them.
          </Empty>
        ) : (
          <ul className="list-unstyled mb-0">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="d-flex justify-content-between align-items-center py-2 border-bottom"
                style={{ borderColor: 'var(--ws-line-soft)' }}
              >
                <span>
                  <strong style={{ fontSize: '0.9rem' }}>
                    {DOCUMENT_TYPES.find((t) => t.value === doc.type)?.label ?? doc.type}
                  </strong>
                  <span className="ws-muted d-block" style={{ fontSize: '0.82rem' }}>
                    {doc.filename ?? doc.label ?? 'File'} · {formatDate(doc.uploadedAt)}
                  </span>
                </span>
                <span className="d-flex gap-2">
                  <a
                    className="btn ws-btn-ghost ws-btn-sm"
                    href={assetUrl(doc.publicId, { resourceType: doc.resourceType })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                  <button
                    type="button"
                    className="btn ws-btn-danger ws-btn-sm"
                    onClick={() => removeDocument(doc.id)}
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="ws-faint mt-2 mb-0" style={{ fontSize: '0.82rem' }}>
          Opening a document is recorded in the audit log.
        </p>
      </Panel>

      {credentials && (
        <div className="ws-modal-backdrop">
          <div
            className="ws-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ws-reset-title"
          >
            <div className="ws-modal-head">
              <h2 className="ws-modal-title" id="ws-reset-title">
                New password for {profile.name}
              </h2>
            </div>
            <div className="ws-modal-body">
              <div className="alert alert-warning ws-alert" role="alert">
                Shown once. Copy it now — it cannot be retrieved again, only reset. Every session
                this account had open has ended.
              </div>
              <p className="ws-code">{credentials}</p>
              <button
                type="button"
                className="btn ws-btn-ghost"
                onClick={() => navigator.clipboard?.writeText(credentials)}
              >
                Copy password
              </button>
            </div>
            <div className="ws-modal-foot">
              <button
                type="button"
                className="btn ws-btn-primary"
                onClick={() => setCredentials(null)}
              >
                I have saved it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function dateInput(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function Field({ col = 'col-12', label, name, value, set, errors, type = 'text', required }) {
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
        onChange={(e) => set(name, e.target.value)}
      />
      {errors?.[name] && <p className="ws-field-error">{errors[name]}</p>}
    </div>
  );
}

function Select({ col = 'col-12', label, name, value, set, options }) {
  return (
    <div className={col}>
      <label className="form-label ws-label" htmlFor={'f-' + name}>
        {label}
      </label>
      <select
        id={'f-' + name}
        className="form-select"
        value={value}
        onChange={(e) => set(name, e.target.value)}
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
