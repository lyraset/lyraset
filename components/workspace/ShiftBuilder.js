'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, apiPatch, apiDelete, issuesByField } from './api';
import { Empty } from './ui';
import { spanMinutes, parseTimeToMinutes } from '@/lib/workspace/calc/schedule';
import { formatDuration } from '@/lib/workspace/calc/attendance';

/**
 * The weekly shift builder.
 *
 * Required minutes are shown per day as they are typed, because the number
 * people actually care about — "how long is Friday?" — is end minus start
 * minus the break, and getting that wrong is the easiest mistake to make here.
 * An end earlier than the start is an overnight shift, and the row says so.
 */

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

const emptyShift = () => ({
  name: '',
  graceMinutes: 15,
  flexible: false,
  isDefault: false,
  active: true,
  days: Object.fromEntries(
    DAYS.map((d) => [d.key, { working: false, start: '10:00', end: '19:00', breakMinutes: 60 }])
  ),
});

export default function ShiftBuilder({ shifts }) {
  const router = useRouter();
  const [form, setForm] = useState(emptyShift);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const setDay = (key, patch) =>
    setForm((f) => ({ ...f, days: { ...f.days, [key]: { ...f.days[key], ...patch } } }));

  const startEdit = (shift) => {
    setEditingId(shift.id);
    setForm({
      name: shift.name,
      graceMinutes: shift.graceMinutes,
      flexible: shift.flexible,
      isDefault: shift.isDefault,
      active: shift.active,
      days: Object.fromEntries(
        DAYS.map((d) => [
          d.key,
          {
            working: shift.days?.[d.key]?.working ?? false,
            start: shift.days?.[d.key]?.start ?? '10:00',
            end: shift.days?.[d.key]?.end ?? '19:00',
            breakMinutes: shift.days?.[d.key]?.breakMinutes ?? 0,
          },
        ])
      ),
    });
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      const body = {
        name: form.name,
        graceMinutes: Number(form.graceMinutes),
        flexible: form.flexible,
        isDefault: form.isDefault,
        active: form.active,
        days: Object.fromEntries(
          DAYS.map((d) => {
            const day = form.days[d.key];
            return [
              d.key,
              day.working
                ? {
                    working: true,
                    start: day.start,
                    end: day.end,
                    breakMinutes: Number(day.breakMinutes) || 0,
                  }
                : { working: false, start: null, end: null, breakMinutes: 0 },
            ];
          })
        ),
      };
      if (editingId) await apiPatch('/api/workspace/settings/shifts', { id: editingId, ...body });
      else await apiPost('/api/workspace/settings/shifts', body);
      setForm(emptyShift());
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError(err.message);
      setFieldErrors(issuesByField(err));
    } finally {
      setBusy(false);
    }
  };

  const retire = async (id) => {
    setBusy(true);
    setError('');
    try {
      await apiDelete('/api/workspace/settings/shifts?id=' + id);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && (
        <div className="alert alert-danger ws-alert" role="alert">
          {error}
        </div>
      )}

      {shifts.length === 0 ? (
        <Empty title="No shifts yet">
          Build the first one below. Everyone who clocks in needs a shift, or their days require
          nothing.
        </Empty>
      ) : (
        <div className="ws-grid ws-grid-2 mb-4">
          {shifts.map((shift) => (
            <div
              className="ws-task"
              key={shift.id}
              style={shift.active ? undefined : { opacity: 0.55 }}
            >
              <div className="ws-task-head">
                <div>
                  <p className="mb-0" style={{ fontWeight: 600 }}>
                    {shift.name}
                    {shift.isDefault && <span className="ws-flag ms-2">Default</span>}
                    {shift.flexible && <span className="ws-flag ms-1">Flexible</span>}
                    {!shift.active && <span className="ws-flag ms-1">Retired</span>}
                  </p>
                  <p className="ws-person-meta mb-0">
                    {shift.flexible ? 'No late marking' : shift.graceMinutes + ' minutes grace'} ·{' '}
                    {formatDuration(weeklyMinutes(shift))} a week
                  </p>
                </div>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn ws-btn-ghost ws-btn-sm"
                    onClick={() => startEdit(shift)}
                  >
                    Edit
                  </button>
                  {shift.active && (
                    <button
                      type="button"
                      className="btn ws-btn-danger ws-btn-sm"
                      onClick={() => retire(shift.id)}
                      disabled={busy}
                    >
                      Retire
                    </button>
                  )}
                </div>
              </div>

              <dl className="ws-kv mb-0" style={{ gridTemplateColumns: '6rem 1fr' }}>
                {DAYS.map((day) => {
                  const value = shift.days?.[day.key];
                  return (
                    <div key={day.key} style={{ display: 'contents' }}>
                      <dt>{day.label}</dt>
                      <dd className="ws-mono">
                        {value?.working
                          ? value.start +
                            '–' +
                            value.end +
                            (value.breakMinutes ? ' · ' + value.breakMinutes + 'm break' : '') +
                            ' · ' +
                            formatDuration(requiredFor(value))
                          : 'Off'}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit}>
        <h3 className="ws-panel-title">{editingId ? 'Edit shift' : 'Add a shift'}</h3>

        <div className="row g-3 mb-3">
          <div className="col-12 col-md-4">
            <label className="form-label ws-label ws-required" htmlFor="shift-name">
              Name
            </label>
            <input
              id="shift-name"
              className="form-control"
              value={form.name}
              placeholder="Standard, Night — US clients"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            {fieldErrors.name && <p className="ws-field-error">{fieldErrors.name}</p>}
          </div>

          <div className="col-6 col-md-2">
            <label className="form-label ws-label" htmlFor="shift-grace">
              Grace (minutes)
            </label>
            <input
              id="shift-grace"
              type="number"
              min="0"
              max="240"
              className="form-control"
              value={form.graceMinutes}
              disabled={form.flexible}
              onChange={(e) => setForm((f) => ({ ...f, graceMinutes: e.target.value }))}
            />
          </div>

          <div className="col-12 col-md-6 d-flex align-items-end gap-3 flex-wrap">
            <Toggle
              id="shift-flexible"
              label="Flexible (no fixed start, never late)"
              checked={form.flexible}
              onChange={(v) => setForm((f) => ({ ...f, flexible: v }))}
            />
            <Toggle
              id="shift-default"
              label="Default shift"
              checked={form.isDefault}
              onChange={(v) => setForm((f) => ({ ...f, isDefault: v }))}
            />
            <Toggle
              id="shift-active"
              label="Active"
              checked={form.active}
              onChange={(v) => setForm((f) => ({ ...f, active: v }))}
            />
          </div>
        </div>

        <div className="ws-table-wrap mb-3">
          <table className="ws-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Working</th>
                <th scope="col">Start</th>
                <th scope="col">End</th>
                <th scope="col">Break (min)</th>
                <th scope="col">Required</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day) => {
                const value = form.days[day.key];
                const overnight =
                  value.working &&
                  parseTimeToMinutes(value.end) != null &&
                  parseTimeToMinutes(value.start) != null &&
                  parseTimeToMinutes(value.end) <= parseTimeToMinutes(value.start);
                return (
                  <tr key={day.key}>
                    <th scope="row" style={{ fontWeight: 500 }}>
                      {day.label}
                    </th>
                    <td>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        aria-label={day.label + ' is a working day'}
                        checked={value.working}
                        onChange={(e) => setDay(day.key, { working: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        className="form-control"
                        aria-label={day.label + ' start'}
                        value={value.start ?? ''}
                        disabled={!value.working}
                        onChange={(e) => setDay(day.key, { start: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        className="form-control"
                        aria-label={day.label + ' end'}
                        value={value.end ?? ''}
                        disabled={!value.working}
                        onChange={(e) => setDay(day.key, { end: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="720"
                        className="form-control"
                        aria-label={day.label + ' break minutes'}
                        value={value.breakMinutes ?? 0}
                        disabled={!value.working}
                        onChange={(e) => setDay(day.key, { breakMinutes: e.target.value })}
                      />
                    </td>
                    <td className="ws-mono">
                      {value.working ? formatDuration(requiredFor(value)) : '—'}
                      {overnight && <span className="ws-flag ms-1">Overnight</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="d-flex gap-2">
          <button type="submit" className="btn ws-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editingId ? 'Save shift' : 'Add shift'}
          </button>
          {editingId && (
            <button
              type="button"
              className="btn ws-btn-ghost"
              onClick={() => {
                setEditingId(null);
                setForm(emptyShift());
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </>
  );
}

function Toggle({ id, label, checked, onChange }) {
  return (
    <div className="form-check">
      <input
        id={id}
        type="checkbox"
        className="form-check-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label className="form-check-label" htmlFor={id}>
        {label}
      </label>
    </div>
  );
}

function requiredFor(day) {
  const start = parseTimeToMinutes(day.start);
  const end = parseTimeToMinutes(day.end);
  if (start == null || end == null) return 0;
  return Math.max(0, spanMinutes(start, end) - (Number(day.breakMinutes) || 0));
}

function weeklyMinutes(shift) {
  return DAYS.reduce((sum, day) => {
    const value = shift.days?.[day.key];
    return value?.working ? sum + requiredFor(value) : sum;
  }, 0);
}
