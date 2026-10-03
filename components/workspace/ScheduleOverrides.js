'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, apiPatch, apiDelete, issuesByField } from './api';
import { Empty } from './ui';

/**
 * Date-range overrides.
 *
 * Only the days you tick are changed, and within a day only the fields you
 * fill in — so a Ramadan override can shorten the afternoon without restating
 * every start time, and an early close can move one end time and nothing else.
 */

const DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const emptyForm = () => ({
  name: '',
  from: '',
  to: '',
  note: '',
  active: true,
  days: Object.fromEntries(
    DAYS.map((d) => [
      d.key,
      { enabled: false, working: true, start: '', end: '', breakMinutes: '' },
    ])
  ),
});

export default function ScheduleOverrides({ schedules }) {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const setDay = (key, patch) =>
    setForm((f) => ({ ...f, days: { ...f.days, [key]: { ...f.days[key], ...patch } } }));

  const startEdit = (schedule) => {
    setEditingId(schedule.id);
    setForm({
      name: schedule.name,
      from: schedule.from,
      to: schedule.to,
      note: schedule.note ?? '',
      active: schedule.active,
      days: Object.fromEntries(
        DAYS.map((d) => {
          const day = schedule.days?.[d.key];
          return [
            d.key,
            {
              enabled: Boolean(day),
              working: day?.working !== false,
              start: day?.start ?? '',
              end: day?.end ?? '',
              breakMinutes: day?.breakMinutes ?? '',
            },
          ];
        })
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
      const days = {};
      for (const day of DAYS) {
        const value = form.days[day.key];
        if (!value.enabled) continue;
        const entry = { working: value.working };
        // Only send what was filled in, so the rest falls through to the shift.
        if (value.start) entry.start = value.start;
        if (value.end) entry.end = value.end;
        if (value.breakMinutes !== '') entry.breakMinutes = Number(value.breakMinutes);
        days[day.key] = entry;
      }

      const body = {
        name: form.name,
        from: form.from,
        to: form.to,
        days,
        note: form.note || null,
        active: form.active,
      };

      if (editingId)
        await apiPatch('/api/workspace/settings/schedules', { id: editingId, ...body });
      else await apiPost('/api/workspace/settings/schedules', body);

      setForm(emptyForm());
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
      await apiDelete('/api/workspace/settings/schedules?id=' + id);
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

      {schedules.length === 0 ? (
        <Empty title="No overrides yet">
          Add one for Ramadan timings, a seasonal change, or a single early close.
        </Empty>
      ) : (
        <ul className="list-unstyled mb-4">
          {schedules.map((schedule) => (
            <li
              className="ws-task"
              key={schedule.id}
              style={schedule.active ? undefined : { opacity: 0.55 }}
            >
              <div className="ws-task-head">
                <div>
                  <p className="mb-0" style={{ fontWeight: 600 }}>
                    {schedule.name}
                    {!schedule.active && <span className="ws-flag ms-2">Retired</span>}
                  </p>
                  <p className="ws-person-meta mb-0">{schedule.summary}</p>
                </div>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn ws-btn-ghost ws-btn-sm"
                    onClick={() => startEdit(schedule)}
                  >
                    Edit
                  </button>
                  {schedule.active && (
                    <button
                      type="button"
                      className="btn ws-btn-danger ws-btn-sm"
                      onClick={() => retire(schedule.id)}
                      disabled={busy}
                    >
                      Retire
                    </button>
                  )}
                </div>
              </div>

              <p className="ws-muted mb-0" style={{ fontSize: '0.875rem' }}>
                {DAYS.filter((d) => schedule.days?.[d.key])
                  .map((d) => {
                    const day = schedule.days[d.key];
                    if (day.working === false) return d.label + ': off';
                    const parts = [day.start, day.end].filter(Boolean).join('–');
                    return (
                      d.label +
                      ': ' +
                      (parts || 'unchanged') +
                      (day.breakMinutes != null ? ' (' + day.breakMinutes + 'm break)' : '')
                    );
                  })
                  .join(' · ') || 'No days set'}
              </p>
              {schedule.note && (
                <p className="ws-faint mb-0" style={{ fontSize: '0.82rem' }}>
                  {schedule.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit}>
        <h3 className="ws-panel-title">{editingId ? 'Edit override' : 'Add an override'}</h3>

        <div className="row g-3 mb-3">
          <div className="col-12 col-md-8">
            <label className="form-label ws-label ws-required" htmlFor="sched-name">
              Name
            </label>
            <input
              id="sched-name"
              className="form-control"
              value={form.name}
              placeholder="Ramadan timings"
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            {fieldErrors.name && <p className="ws-field-error">{fieldErrors.name}</p>}
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label ws-label ws-required" htmlFor="sched-from">
              From
            </label>
            <input
              id="sched-from"
              type="date"
              className="form-control"
              value={form.from}
              onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
            />
            {fieldErrors.from && <p className="ws-field-error">{fieldErrors.from}</p>}
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label ws-label ws-required" htmlFor="sched-to">
              To
            </label>
            <input
              id="sched-to"
              type="date"
              className="form-control"
              value={form.to}
              min={form.from}
              onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
            />
            {fieldErrors.to && <p className="ws-field-error">{fieldErrors.to}</p>}
          </div>
        </div>

        <div className="ws-table-wrap mb-3">
          <table className="ws-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Override</th>
                <th scope="col">Working</th>
                <th scope="col">Start</th>
                <th scope="col">End</th>
                <th scope="col">Break (min)</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day) => {
                const value = form.days[day.key];
                return (
                  <tr key={day.key}>
                    <th scope="row" style={{ fontWeight: 500 }}>
                      {day.label}
                    </th>
                    <td>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        aria-label={'Override ' + day.label}
                        checked={value.enabled}
                        onChange={(e) => setDay(day.key, { enabled: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        aria-label={day.label + ' is a working day'}
                        checked={value.working}
                        disabled={!value.enabled}
                        onChange={(e) => setDay(day.key, { working: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        className="form-control"
                        aria-label={day.label + ' start'}
                        value={value.start}
                        disabled={!value.enabled || !value.working}
                        onChange={(e) => setDay(day.key, { start: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        className="form-control"
                        aria-label={day.label + ' end'}
                        value={value.end}
                        disabled={!value.enabled || !value.working}
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
                        value={value.breakMinutes}
                        placeholder="unchanged"
                        disabled={!value.enabled || !value.working}
                        onChange={(e) => setDay(day.key, { breakMinutes: e.target.value })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="row g-3 mb-3">
          <div className="col-12 col-md-8">
            <label className="form-label ws-label" htmlFor="sched-note">
              Note
            </label>
            <input
              id="sched-note"
              className="form-control"
              maxLength={400}
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
          <div className="col-12 col-md-4 d-flex align-items-end">
            <div className="form-check">
              <input
                id="sched-active"
                type="checkbox"
                className="form-check-input"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              <label className="form-check-label" htmlFor="sched-active">
                Active
              </label>
            </div>
          </div>
        </div>

        <div className="d-flex gap-2">
          <button type="submit" className="btn ws-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editingId ? 'Save override' : 'Add override'}
          </button>
          {editingId && (
            <button
              type="button"
              className="btn ws-btn-ghost"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm());
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
