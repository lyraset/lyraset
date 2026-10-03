'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPatch, issuesByField } from './api';
import Filters from './Filters';
import { Panel, StatusBadge, Flags, TableWrap, formatDate, formatDuration, formatTime } from './ui';

/**
 * One employee's cycle, day by day, with the EOD beside the attendance.
 *
 * The Owner's edit control lives here rather than on a separate page: fixing a
 * wrong clock-out is something you do while looking at the day, and the reason
 * field is required precisely because the record is otherwise a statement of
 * what the server observed.
 */
export default function DrillDown({ userId, userName, days, canEdit, from, to }) {
  const router = useRouter();
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  const toggle = (workDate) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(workDate)) next.delete(workDate);
      else next.add(workDate);
      return next;
    });

  return (
    <>
      <Panel>
        <Filters
          fields={[
            { name: 'from', label: 'From', type: 'date' },
            { name: 'to', label: 'To', type: 'date' },
          ]}
        />

        <TableWrap label={'Attendance and EOD for ' + userName}>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Shift</th>
              <th scope="col">In</th>
              <th scope="col">Out</th>
              <th scope="col" className="ws-num">
                Worked
              </th>
              <th scope="col">Status</th>
              <th scope="col">EOD</th>
              {canEdit && <th scope="col">Edit</th>}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.workDate}>
                <td>{formatDate(day.workDate, { weekday: true })}</td>
                <td className="ws-mono ws-muted">
                  {day.schedule.working ? day.schedule.start + '–' + day.schedule.end : '—'}
                </td>
                <td className="ws-mono">{formatTime(day.record?.clockIn)}</td>
                <td className="ws-mono">{formatTime(day.record?.clockOut)}</td>
                <td className="ws-mono ws-num">{formatDuration(day.computed.workedMinutes)}</td>
                <td>
                  <StatusBadge status={day.status} />{' '}
                  <Flags flags={day.computed.flags} hide={[day.status]} />
                  {day.record?.editReason && <span className="ws-flag">Edited</span>}
                </td>
                <td>
                  {day.eod ? (
                    <button
                      type="button"
                      className="btn ws-btn-ghost ws-btn-sm"
                      onClick={() => toggle(day.workDate)}
                      aria-expanded={expanded.has(day.workDate)}
                    >
                      {expanded.has(day.workDate) ? 'Hide' : day.eod.tasks.length + ' task(s)'}
                    </button>
                  ) : (
                    <span className="ws-faint">
                      {day.computed.isWorkingDay && day.record?.clockIn ? 'Missing' : '—'}
                    </span>
                  )}
                </td>
                {canEdit && (
                  <td>
                    <button
                      type="button"
                      className="btn ws-btn-ghost ws-btn-sm"
                      onClick={() =>
                        setEditing({
                          workDate: day.workDate,
                          clockIn: formatTime(day.record?.clockIn).replace('—', ''),
                          clockOut: formatTime(day.record?.clockOut).replace('—', ''),
                          overtimeMinutes: day.computed.overtimeMinutes,
                          overtimeApproved: Boolean(day.record?.overtimeApproved),
                        })
                      }
                    >
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </TableWrap>

        {days
          .filter((day) => day.eod && expanded.has(day.workDate))
          .map((day) => (
            <div className="ws-task mt-3" key={'eod-' + day.workDate}>
              <p className="ws-task-index">{formatDate(day.workDate, { weekday: true })}</p>
              {day.eod.tasks.map((task, index) => (
                <div key={index} className="mb-2">
                  <p className="mb-1" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {task.title}
                    <span className="ws-flag ms-2">{task.projectName ?? 'Internal / Other'}</span>
                  </p>
                  <p className="ws-muted mb-0" style={{ fontSize: '0.875rem' }}>
                    {task.description}
                    {task.minutes ? ' · ' + formatDuration(task.minutes) : ''}
                  </p>
                </div>
              ))}
              {day.eod.blockers && (
                <p className="ws-muted mb-0" style={{ fontSize: '0.875rem' }}>
                  <strong>Blockers:</strong> {day.eod.blockers}
                </p>
              )}
            </div>
          ))}
      </Panel>

      {editing && (
        <EditDayDialog
          userId={userId}
          userName={userName}
          day={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/** The Owner's manual edit. A reason is required and the change is audited. */
function EditDayDialog({ userId, userName, day, onClose, onSaved }) {
  const [clockIn, setClockIn] = useState(day.clockIn || '');
  const [clockOut, setClockOut] = useState(day.clockOut || '');
  const [approveOvertime, setApproveOvertime] = useState(day.overtimeApproved);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiPatch('/api/workspace/attendance/day', {
        userId,
        workDate: day.workDate,
        clockIn: clockIn || null,
        clockOut: clockOut || null,
        overtimeApproved: approveOvertime,
        reason: reason.trim(),
      });
      onSaved();
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
      <div className="ws-modal" role="dialog" aria-modal="true" aria-labelledby="ws-edit-title">
        <div className="ws-modal-head">
          <h2 className="ws-modal-title" id="ws-edit-title">
            Edit {formatDate(day.workDate)} for {userName}
          </h2>
        </div>

        <form onSubmit={save}>
          <div className="ws-modal-body">
            {error && (
              <div className="alert alert-danger ws-alert" role="alert">
                {error}
              </div>
            )}

            <div className="row g-3">
              <div className="col-6">
                <label className="form-label ws-label" htmlFor="edit-in">
                  Clock in
                </label>
                <input
                  id="edit-in"
                  type="time"
                  className="form-control"
                  value={clockIn}
                  onChange={(e) => setClockIn(e.target.value)}
                />
              </div>
              <div className="col-6">
                <label className="form-label ws-label" htmlFor="edit-out">
                  Clock out
                </label>
                <input
                  id="edit-out"
                  type="time"
                  className="form-control"
                  value={clockOut}
                  onChange={(e) => setClockOut(e.target.value)}
                />
              </div>

              {day.overtimeMinutes > 0 && (
                <div className="col-12">
                  <div className="form-check">
                    <input
                      id="edit-ot"
                      type="checkbox"
                      className="form-check-input"
                      checked={approveOvertime}
                      onChange={(e) => setApproveOvertime(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="edit-ot">
                      Approve {formatDuration(day.overtimeMinutes)} of overtime for this day
                    </label>
                  </div>
                </div>
              )}

              <div className="col-12">
                <label className="form-label ws-label ws-required" htmlFor="edit-reason">
                  Why are you changing this?
                </label>
                <textarea
                  id="edit-reason"
                  className="form-control"
                  rows={2}
                  maxLength={400}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <p className="form-text">Kept in the audit log with the values before and after.</p>
                {fieldErrors.reason && <p className="ws-field-error">{fieldErrors.reason}</p>}
              </div>
            </div>
          </div>

          <div className="ws-modal-foot">
            <button type="button" className="btn ws-btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn ws-btn-primary"
              disabled={saving || reason.trim().length < 5}
            >
              {saving ? 'Saving…' : 'Save change'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
