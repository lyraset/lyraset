'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, apiPatch, uploadPrivateFile, issuesByField } from './api';
import { StatusBadge, TableWrap, Empty, formatDate } from './ui';

/**
 * Corrections, work from home, official duty and overtime claims.
 *
 * One form with four shapes. The fields change with the type because the four
 * requests genuinely ask for different things, but they share a reason, an
 * optional piece of evidence, and the same approval route.
 */

const TYPES = [
  {
    value: 'CORRECTION',
    label: 'Attendance correction',
    hint: 'A missed clock-in or clock-out, or a wrong time.',
  },
  { value: 'WFH', label: 'Work from home', hint: 'Specific dates you will work remotely.' },
  {
    value: 'OFFICIAL_DUTY',
    label: 'Official duty',
    hint: 'A client visit or work away from the office.',
  },
  { value: 'OVERTIME', label: 'Overtime claim', hint: 'Hours worked beyond the required minutes.' },
];

export default function RequestForm({ requests }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);

  const [type, setType] = useState('CORRECTION');
  const [dates, setDates] = useState([today]);
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [location, setLocation] = useState('');
  const [minutes, setMinutes] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(null);

  const singleDate = type === 'CORRECTION' || type === 'OVERTIME';
  const selected = TYPES.find((t) => t.value === type);

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      setEvidence(await uploadPrivateFile(file, 'REQUEST'));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const buildPayload = () => {
    if (type === 'CORRECTION') {
      return { clockIn: clockIn || null, clockOut: clockOut || null };
    }
    if (type === 'OFFICIAL_DUTY') return { location: location || null };
    if (type === 'OVERTIME') return { minutes: minutes === '' ? null : Number(minutes) };
    return {};
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    setSaving(true);
    try {
      await apiPost('/api/workspace/requests', {
        type,
        dates: singleDate ? [dates[0]] : dates.filter(Boolean),
        payload: buildPayload(),
        reason: reason.trim(),
        evidence,
      });
      setReason('');
      setClockIn('');
      setClockOut('');
      setLocation('');
      setMinutes('');
      setEvidence(null);
      router.refresh();
    } catch (err) {
      setError(err.message);
      setFieldErrors(issuesByField(err));
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async (id) => {
    setBusy(id);
    setError('');
    try {
      await apiPatch('/api/workspace/requests/' + id, { action: 'CANCEL' });
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <form onSubmit={submit} className="mb-4">
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label ws-label ws-required" htmlFor="request-type">
              What do you need?
            </label>
            <select
              id="request-type"
              className="form-select"
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setDates([today]);
              }}
            >
              {TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="form-text">{selected.hint}</p>
          </div>

          <div className="col-6 col-md-3">
            <label className="form-label ws-label ws-required" htmlFor="request-from">
              {singleDate ? 'Date' : 'From'}
            </label>
            <input
              id="request-from"
              type="date"
              className="form-control"
              value={dates[0] ?? ''}
              onChange={(e) => setDates([e.target.value, ...(singleDate ? [] : dates.slice(1))])}
            />
            {fieldErrors.dates && <p className="ws-field-error">{fieldErrors.dates}</p>}
          </div>

          {!singleDate && (
            <div className="col-6 col-md-3">
              <label className="form-label ws-label" htmlFor="request-to">
                To
              </label>
              <input
                id="request-to"
                type="date"
                className="form-control"
                min={dates[0] ?? ''}
                value={dates[dates.length - 1] ?? ''}
                onChange={(e) => setDates(expandDates(dates[0], e.target.value))}
              />
            </div>
          )}

          {type === 'CORRECTION' && (
            <>
              <div className="col-6 col-md-3">
                <label className="form-label ws-label" htmlFor="request-in">
                  Correct clock-in
                </label>
                <input
                  id="request-in"
                  type="time"
                  className="form-control"
                  value={clockIn}
                  onChange={(e) => setClockIn(e.target.value)}
                />
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label ws-label" htmlFor="request-out">
                  Correct clock-out
                </label>
                <input
                  id="request-out"
                  type="time"
                  className="form-control"
                  value={clockOut}
                  onChange={(e) => setClockOut(e.target.value)}
                />
              </div>
            </>
          )}

          {type === 'OFFICIAL_DUTY' && (
            <div className="col-12 col-md-6">
              <label className="form-label ws-label" htmlFor="request-location">
                Where
              </label>
              <input
                id="request-location"
                className="form-control"
                maxLength={200}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Client office, event venue…"
              />
            </div>
          )}

          {type === 'OVERTIME' && (
            <div className="col-6 col-md-3">
              <label className="form-label ws-label" htmlFor="request-minutes">
                Minutes claimed
              </label>
              <input
                id="request-minutes"
                type="number"
                min="1"
                max="1440"
                className="form-control"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
              <p className="form-text">Leave blank to claim everything the day recorded.</p>
            </div>
          )}

          <div className="col-12">
            <label className="form-label ws-label ws-required" htmlFor="request-reason">
              Reason
            </label>
            <textarea
              id="request-reason"
              className="form-control"
              rows={2}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {fieldErrors.reason && <p className="ws-field-error">{fieldErrors.reason}</p>}
          </div>

          <div className="col-12">
            <label className="form-label ws-label" htmlFor="request-evidence">
              Evidence (optional)
            </label>
            <input
              id="request-evidence"
              type="file"
              className="form-control"
              onChange={onFile}
              disabled={uploading}
            />
            {uploading && <p className="form-text">Uploading…</p>}
            {evidence && <p className="form-text">Attached: {evidence.filename}</p>}
          </div>
        </div>

        {error && (
          <div className="alert alert-danger ws-alert mt-3" role="alert">
            {error}
          </div>
        )}

        <button type="submit" className="btn ws-btn-primary mt-3" disabled={saving || uploading}>
          {saving ? 'Submitting…' : 'Submit request'}
        </button>
      </form>

      {requests.length === 0 ? (
        <Empty title="No requests yet">
          Corrections, work-from-home days, official duty and overtime claims all appear here once
          submitted.
        </Empty>
      ) : (
        <TableWrap label="My requests">
          <thead>
            <tr>
              <th scope="col">Type</th>
              <th scope="col">Dates</th>
              <th scope="col" className="ws-wrap">
                Reason
              </th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{request.typeLabel}</td>
                <td>
                  {request.dates.length === 1
                    ? formatDate(request.dates[0])
                    : formatDate(request.dates[0]) + ' to ' + formatDate(request.dates.at(-1))}
                </td>
                <td className="ws-wrap ws-muted">
                  {request.reason}
                  {request.reviewComment && (
                    <span className="d-block ws-faint">Reviewer: {request.reviewComment}</span>
                  )}
                </td>
                <td>
                  <StatusBadge status={request.status} />
                </td>
                <td>
                  {request.status === 'PENDING' ? (
                    <button
                      type="button"
                      className="btn ws-btn-ghost ws-btn-sm"
                      onClick={() => withdraw(request.id)}
                      disabled={busy === request.id}
                    >
                      {busy === request.id ? 'Withdrawing…' : 'Withdraw'}
                    </button>
                  ) : (
                    <span className="ws-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}

/** Every date from `from` to `to`, inclusive, as YYYY-MM-DD. */
function expandDates(from, to) {
  if (!from || !to || to < from) return [from].filter(Boolean);
  const out = [];
  const cursor = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (cursor <= end && out.length < 60) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
