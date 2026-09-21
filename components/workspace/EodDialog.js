'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { apiPost, apiPatch, uploadPrivateFile, issuesByField } from './api';
import { formatDuration } from '@/lib/workspace/calc/attendance';

/**
 * The end-of-day dialog.
 *
 * Clocking out opens this rather than clocking out immediately: the report and
 * the clock-out are one action, and the clock-out time is stamped when the
 * report is submitted. Cancelling leaves the employee clocked in.
 *
 * The draft autosaves to localStorage under a key per user and date, so a
 * closed tab does not lose what someone typed. It is cleared on success.
 */

const emptyTask = () => ({
  projectId: '',
  title: '',
  description: '',
  minutes: '',
  status: 'COMPLETED',
});

const TASK_STATUSES = [
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'BLOCKED', label: 'Blocked' },
];

export default function EodDialog({
  open,
  onClose,
  onDone,
  userId,
  workDate,
  projects = [],
  summary = null,
  minDescription = 0,
  mode = 'CLOCK_OUT',
  initial = null,
  eodId = null,
}) {
  const draftKey = 'ws-eod-draft:' + userId + ':' + workDate;
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  const previouslyFocused = useRef(null);

  const [tasks, setTasks] = useState([emptyTask()]);
  const [blockers, setBlockers] = useState('');
  const [tomorrowPlan, setTomorrowPlan] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Restore: an explicit `initial` (editing) wins over any saved draft.
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setTasks(
        (initial.tasks ?? []).map((t) => ({
          projectId: t.projectId ?? '',
          title: t.title ?? '',
          description: t.description ?? '',
          minutes: t.minutes ?? '',
          status: t.status ?? 'COMPLETED',
        }))
      );
      setBlockers(initial.blockers ?? '');
      setTomorrowPlan(initial.tomorrowPlan ?? '');
      setAttachments(initial.attachments ?? []);
      return;
    }
    try {
      const saved = JSON.parse(window.localStorage.getItem(draftKey) || 'null');
      if (saved) {
        setTasks(saved.tasks?.length ? saved.tasks : [emptyTask()]);
        setBlockers(saved.blockers ?? '');
        setTomorrowPlan(saved.tomorrowPlan ?? '');
        setAttachments(saved.attachments ?? []);
      }
    } catch {
      // A corrupt draft is not worth an error; start fresh.
    }
  }, [open, draftKey, initial]);

  // Autosave, debounced so typing does not hit storage on every keystroke.
  useEffect(() => {
    if (!open || initial) return undefined;
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({ tasks, blockers, tomorrowPlan, attachments })
        );
      } catch {
        // Private browsing, or storage full. The form still works.
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [open, initial, draftKey, tasks, blockers, tomorrowPlan, attachments]);

  // Focus management: remember what had focus, move into the dialog, restore on close.
  useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current = document.activeElement;
    const timer = setTimeout(() => firstFieldRef.current?.focus(), 30);
    return () => {
      clearTimeout(timer);
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
  }, [open]);

  // Trap Tab inside the dialog, and let Escape cancel.
  const onKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  if (!open) return null;

  const updateTask = (index, patch) =>
    setTasks((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const addTask = () => setTasks((rows) => [...rows, emptyTask()]);
  const removeTask = (index) =>
    setTasks((rows) => (rows.length === 1 ? rows : rows.filter((_, i) => i !== index)));

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const asset = await uploadPrivateFile(file, 'EOD');
      setAttachments((list) => [...list, asset]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const validate = () => {
    const problems = {};
    tasks.forEach((task, index) => {
      if (!task.title.trim()) problems['tasks.' + index + '.title'] = 'Give the task a title.';
      const description = task.description.trim();
      if (!description) problems['tasks.' + index + '.description'] = 'Describe the work.';
      else if (minDescription > 0 && description.length < minDescription) {
        problems['tasks.' + index + '.description'] =
          'Describe the work in at least ' + minDescription + ' characters.';
      }
    });
    return problems;
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const problems = validate();
    setFieldErrors(problems);
    if (Object.keys(problems).length) {
      setError('Some tasks need more detail before this can be submitted.');
      return;
    }

    setSaving(true);
    const payload = {
      tasks: tasks.map((task) => ({
        projectId: task.projectId || null,
        title: task.title.trim(),
        description: task.description.trim(),
        minutes: task.minutes === '' ? null : Number(task.minutes),
        status: task.status,
      })),
      blockers: blockers.trim() || null,
      tomorrowPlan: tomorrowPlan.trim() || null,
      attachments,
    };

    try {
      let result;
      if (mode === 'CLOCK_OUT') {
        result = await apiPost('/api/workspace/attendance/clock-out', payload);
      } else if (mode === 'LATE') {
        result = await apiPost('/api/workspace/eod', { ...payload, workDate });
      } else {
        result = await apiPatch('/api/workspace/eod/' + eodId, payload);
      }
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // Nothing to clean up if storage is unavailable.
      }
      onDone?.(result);
    } catch (err) {
      setError(err.message);
      setFieldErrors(issuesByField(err));
      setSaving(false);
    }
  };

  const titleId = 'ws-eod-title';
  const heading =
    mode === 'CLOCK_OUT'
      ? 'Submit EOD and clock out'
      : mode === 'LATE'
        ? 'Submit EOD for ' + workDate
        : 'Edit EOD';
  const primaryLabel =
    mode === 'CLOCK_OUT'
      ? 'Submit EOD & clock out'
      : mode === 'LATE'
        ? 'Submit EOD'
        : 'Save changes';

  return (
    <div
      className="ws-modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="ws-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        <div className="ws-modal-head">
          <h2 className="ws-modal-title" id={titleId}>
            {heading}
          </h2>
        </div>

        <form onSubmit={submit}>
          <div className="ws-modal-body">
            {summary && (
              <div className="ws-summary-row">
                <div className="ws-summary-item">
                  <p className="ws-label-sm">Clocked in</p>
                  <p className="ws-mono">{summary.clockIn ?? '—'}</p>
                </div>
                <div className="ws-summary-item">
                  <p className="ws-label-sm">Worked so far</p>
                  <p className="ws-mono">{formatDuration(summary.workedMinutes)}</p>
                </div>
                <div className="ws-summary-item">
                  <p className="ws-label-sm">Breaks</p>
                  <p className="ws-mono">{formatDuration(summary.breakMinutes)}</p>
                </div>
                <div className="ws-summary-item">
                  <p className="ws-label-sm">Status</p>
                  <p>{summary.statusLabel ?? '—'}</p>
                </div>
              </div>
            )}

            {error && (
              <div className="alert alert-danger ws-alert" role="alert">
                {error}
              </div>
            )}

            <fieldset className="border-0 p-0 m-0">
              <legend className="ws-label">What did you work on?</legend>

              {tasks.map((task, index) => (
                <div className="ws-task" key={index}>
                  <div className="ws-task-head">
                    <p className="ws-task-index">Task {index + 1}</p>
                    {tasks.length > 1 && (
                      <button
                        type="button"
                        className="btn ws-btn-ghost ws-btn-sm"
                        onClick={() => removeTask(index)}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="row g-2">
                    <div className="col-12 col-md-5">
                      <label className="form-label ws-label" htmlFor={'project-' + index}>
                        Client / project
                      </label>
                      <select
                        id={'project-' + index}
                        className="form-select"
                        value={task.projectId}
                        onChange={(e) => updateTask(index, { projectId: e.target.value })}
                      >
                        <option value="">Internal / Other</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.client ? project.client + ' — ' + project.name : project.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-12 col-md-7">
                      <label className="form-label ws-label ws-required" htmlFor={'title-' + index}>
                        Task
                      </label>
                      <input
                        id={'title-' + index}
                        ref={index === 0 ? firstFieldRef : undefined}
                        className="form-control"
                        value={task.title}
                        maxLength={200}
                        onChange={(e) => updateTask(index, { title: e.target.value })}
                      />
                      {fieldErrors['tasks.' + index + '.title'] && (
                        <p className="ws-field-error">{fieldErrors['tasks.' + index + '.title']}</p>
                      )}
                    </div>

                    <div className="col-12">
                      <label className="form-label ws-label ws-required" htmlFor={'desc-' + index}>
                        What you did
                      </label>
                      <textarea
                        id={'desc-' + index}
                        className="form-control"
                        rows={3}
                        maxLength={4000}
                        value={task.description}
                        onChange={(e) => updateTask(index, { description: e.target.value })}
                      />
                      {minDescription > 0 && (
                        <p className="form-text">
                          {task.description.trim().length} of {minDescription} characters minimum
                        </p>
                      )}
                      {fieldErrors['tasks.' + index + '.description'] && (
                        <p className="ws-field-error">
                          {fieldErrors['tasks.' + index + '.description']}
                        </p>
                      )}
                    </div>

                    <div className="col-6 col-md-4">
                      <label className="form-label ws-label" htmlFor={'minutes-' + index}>
                        Minutes spent
                      </label>
                      <input
                        id={'minutes-' + index}
                        className="form-control"
                        type="number"
                        min="0"
                        max="1440"
                        inputMode="numeric"
                        value={task.minutes}
                        onChange={(e) => updateTask(index, { minutes: e.target.value })}
                      />
                    </div>

                    <div className="col-6 col-md-4">
                      <label className="form-label ws-label" htmlFor={'status-' + index}>
                        Status
                      </label>
                      <select
                        id={'status-' + index}
                        className="form-select"
                        value={task.status}
                        onChange={(e) => updateTask(index, { status: e.target.value })}
                      >
                        {TASK_STATUSES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}

              <button type="button" className="btn ws-btn-ghost ws-btn-sm" onClick={addTask}>
                Add another task
              </button>
            </fieldset>

            <div className="ws-divider" />

            <div className="mb-3">
              <label className="form-label ws-label" htmlFor="ws-blockers">
                Anything blocking you? (optional)
              </label>
              <textarea
                id="ws-blockers"
                className="form-control"
                rows={2}
                maxLength={4000}
                value={blockers}
                onChange={(e) => setBlockers(e.target.value)}
              />
            </div>

            <div className="mb-3">
              <label className="form-label ws-label" htmlFor="ws-tomorrow">
                Plan for tomorrow (optional)
              </label>
              <textarea
                id="ws-tomorrow"
                className="form-control"
                rows={2}
                maxLength={4000}
                value={tomorrowPlan}
                onChange={(e) => setTomorrowPlan(e.target.value)}
              />
            </div>

            <div className="mb-2">
              <label className="form-label ws-label" htmlFor="ws-attachment">
                Attachments (optional)
              </label>
              <input
                id="ws-attachment"
                type="file"
                className="form-control"
                onChange={onFile}
                disabled={uploading || attachments.length >= 10}
              />
              {uploading && <p className="form-text">Uploading…</p>}
              {attachments.length > 0 && (
                <ul className="ws-inline-list mt-2">
                  {attachments.map((file, index) => (
                    <li key={file.publicId}>
                      <span className="ws-muted">{file.filename ?? 'File'}</span>{' '}
                      <button
                        type="button"
                        className="btn ws-btn-ghost ws-btn-sm"
                        onClick={() => setAttachments((list) => list.filter((_, i) => i !== index))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="ws-modal-foot">
            <button type="button" className="btn ws-btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn ws-btn-primary" disabled={saving || uploading}>
              {saving ? 'Submitting…' : primaryLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
