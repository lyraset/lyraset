'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from './api';
import EodDialog from './EodDialog';
import { formatTime } from './ui';
import { formatDuration, STATUS_LABELS } from '@/lib/workspace/calc/attendance';
import { TIMEZONE_LABEL } from '@/lib/workspace/timezone';

/**
 * The clock-in / clock-out panel.
 *
 * Two things this deliberately does not do: it never sends a timestamp (the
 * server stamps every clock event), and it never clocks out directly — the
 * button opens the EOD dialog, and the clock-out happens when that is
 * submitted, in the same transaction.
 */

const BREAK_TYPES = [
  { value: 'LUNCH', label: 'Lunch' },
  { value: 'PRAYER', label: 'Prayer' },
  { value: 'OTHER', label: 'Other' },
];

export default function ClockPanel({ initialState, projects = [], minDescription = 0, userId }) {
  const [state, setState] = useState(initialState);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [eodOpen, setEodOpen] = useState(false);
  const [breakType, setBreakType] = useState('LUNCH');
  const [reason, setReason] = useState('');
  const [needsReason, setNeedsReason] = useState(false);

  // The visible clock ticks every second; the numbers behind it come from the
  // server, so a wrong device clock changes nothing that is recorded.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setState(await apiGet('/api/workspace/attendance/today'));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const localTime = useMemo(() => formatTime(now, { seconds: true }), [now]);

  // Worked minutes tick forward live while clocked in and not on a break.
  const workedMinutes = useMemo(() => {
    const base = state?.computed?.workedMinutes ?? 0;
    if (!state?.clockedIn || state?.onBreak) return base;
    const since = state?.record?.clockIn ? new Date(state.record.clockIn).getTime() : null;
    if (!since) return base;
    const breaks = state?.computed?.breakMinutes ?? 0;
    return Math.max(0, Math.floor((now - since) / 60000) - breaks);
  }, [state, now]);

  /** Ask the browser where it is, but never block a clock-in on the answer. */
  const readPosition = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      const done = (value) => resolve(value);
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          done({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy ?? undefined,
          }),
        () => done(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });

  const clockIn = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const position = await readPosition();
      const result = await apiPost('/api/workspace/attendance/clock-in', {
        position,
        reason: reason.trim() || null,
      });
      setNeedsReason(false);
      setReason('');
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 800);
      setNotice(
        result.officialDutyPending
          ? 'Clocked in. Your day is marked official duty and has gone for approval.'
          : 'Clocked in.'
      );
      await refresh();
    } catch (err) {
      // 422 means the server wants a reason for clocking in off-site.
      if (err.status === 422) setNeedsReason(true);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleBreak = async (action) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await apiPost('/api/workspace/attendance/break', { action, type: breakType });
      setNotice(action === 'START' ? 'Break started.' : 'Break ended.');
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onEodDone = async () => {
    setEodOpen(false);
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 800);
    setNotice('EOD submitted and clocked out. Have a good evening.');
    await refresh();
  };

  const schedule = state?.schedule;
  const statusLabel = STATUS_LABELS[state?.computed?.status] ?? '—';

  const badge = state?.onBreak
    ? 'On break'
    : state?.clockedOut
      ? 'Clocked out'
      : state?.clockedIn
        ? statusLabel
        : 'Not clocked in';

  return (
    <>
      <section className={'ws-panel' + (confirmed ? ' ws-confirmed' : '')}>
        <div className="ws-clock">
          <div>
            <p className="ws-clock-now ws-mono" aria-live="off">
              {localTime}
            </p>
            <p className="ws-clock-zone">
              {TIMEZONE_LABEL} · {state?.workDate}
            </p>

            <p className="ws-clock-shift">
              {schedule?.working
                ? 'Today: ' +
                  schedule.start +
                  ' to ' +
                  schedule.end +
                  ' · ' +
                  formatDuration(schedule.requiredMinutes) +
                  ' required' +
                  (schedule.overrideName ? ' · ' + schedule.overrideName : '')
                : state?.computed?.status === 'HOLIDAY'
                  ? 'Today is a holiday' +
                    (state.computed.holidayName ? ': ' + state.computed.holidayName : '')
                  : 'Today is not a working day'}
            </p>

            <div className="d-flex align-items-center gap-3 mt-3 flex-wrap">
              <span
                className={
                  'ws-badge ws-badge-' +
                  (state?.onBreak ? 'SHORT_LEAVE' : (state?.computed?.status ?? 'NOT_MARKED'))
                }
              >
                {badge}
              </span>
              <p className="ws-clock-worked ws-mono" aria-live="polite">
                {formatDuration(workedMinutes)} worked
              </p>
              {state?.computed?.breakMinutes > 0 && (
                <span className="ws-muted">
                  {formatDuration(state.computed.breakMinutes)} on breaks
                </span>
              )}
            </div>
          </div>

          <div className="ws-clock-actions">
            {state?.canClockIn && (
              <button
                type="button"
                className="btn ws-btn-primary ws-clock-btn"
                onClick={clockIn}
                disabled={busy}
              >
                {busy ? 'Working…' : 'Clock in'}
              </button>
            )}

            {state?.canClockOut && (
              <>
                <button
                  type="button"
                  className="btn ws-btn-primary ws-clock-btn"
                  onClick={() => setEodOpen(true)}
                  disabled={busy}
                >
                  Clock out
                </button>

                {state.onBreak ? (
                  <button
                    type="button"
                    className="btn ws-btn-ghost"
                    onClick={() => toggleBreak('END')}
                    disabled={busy}
                  >
                    End break
                  </button>
                ) : (
                  <div className="input-group">
                    <select
                      className="form-select"
                      value={breakType}
                      onChange={(e) => setBreakType(e.target.value)}
                      aria-label="Break type"
                    >
                      {BREAK_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn ws-btn-ghost"
                      onClick={() => toggleBreak('START')}
                      disabled={busy}
                    >
                      Start break
                    </button>
                  </div>
                )}
              </>
            )}

            {state?.clockedOut && (
              <p className="ws-muted mb-0">
                You clocked out at{' '}
                <span className="ws-mono">{formatTime(state.record.clockOut)}</span>.
              </p>
            )}
          </div>
        </div>

        {needsReason && (
          <div className="mt-3">
            <label className="form-label ws-label ws-required" htmlFor="ws-clockin-reason">
              Why are you clocking in from here?
            </label>
            <input
              id="ws-clockin-reason"
              className="form-control"
              placeholder="Client visit, official duty, working from a partner office…"
              value={reason}
              maxLength={400}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="form-text">
              Your day will be marked official duty and sent for approval.
            </p>
          </div>
        )}

        {notice && (
          <div className="alert alert-success ws-alert mt-3 mb-0" role="status">
            {notice}
          </div>
        )}
        {error && (
          <div className="alert alert-danger ws-alert mt-3 mb-0" role="alert">
            {error}
          </div>
        )}
      </section>

      <EodDialog
        open={eodOpen}
        onClose={() => setEodOpen(false)}
        onDone={onEodDone}
        userId={userId}
        workDate={state?.workDate}
        projects={projects}
        minDescription={minDescription}
        mode="CLOCK_OUT"
        summary={{
          clockIn: state?.record?.clockIn ? formatTime(state.record.clockIn) : null,
          workedMinutes,
          breakMinutes: state?.computed?.breakMinutes ?? 0,
          statusLabel,
        }}
      />
    </>
  );
}
