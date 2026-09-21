'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost } from './api';
import { TableWrap, formatDate } from './ui';

/**
 * Locking a company month.
 *
 * A lock is a statement that the numbers were reviewed, so the button is only
 * offered once the cycle has ended, and unlocking asks for a reason that is
 * kept. While locked, every dated write in the system refuses — including the
 * Owner's own edits.
 */
export default function PayrollClose({ office, periods }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [unlocking, setUnlocking] = useState(null);
  const [reason, setReason] = useState('');

  const lock = async (cycleKey) => {
    setBusy(cycleKey);
    setError('');
    try {
      await apiPost('/api/workspace/payroll', { action: 'LOCK', office, cycleKey });
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const unlock = async (event) => {
    event.preventDefault();
    setBusy(unlocking);
    setError('');
    try {
      await apiPost('/api/workspace/payroll', {
        action: 'UNLOCK',
        office,
        cycleKey: unlocking,
        reason: reason.trim(),
      });
      setUnlocking(null);
      setReason('');
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {error && (
        <div className="alert alert-danger ws-alert" role="alert">
          {error}
        </div>
      )}

      <TableWrap label={'Payroll periods for ' + office}>
        <thead>
          <tr>
            <th scope="col">Cycle</th>
            <th scope="col">Dates</th>
            <th scope="col">Status</th>
            <th scope="col">Locked</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period.cycleKey}>
              <td>
                {period.cycleLabel}
                {period.isCurrent && <span className="ws-flag ms-2">Running</span>}
              </td>
              <td className="ws-muted">
                {formatDate(period.startDate)} to {formatDate(period.endDate)}
              </td>
              <td>
                <span
                  className={
                    'ws-badge ws-badge-' + (period.status === 'LOCKED' ? 'APPROVED' : 'PENDING')
                  }
                >
                  {period.status === 'LOCKED' ? 'Locked' : 'Open'}
                </span>
                {period.unlockCount > 0 && (
                  <span className="ws-flag ms-1">Unlocked {period.unlockCount}x</span>
                )}
              </td>
              <td className="ws-muted">{period.lockedAt ? formatDate(period.lockedAt) : '—'}</td>
              <td>
                {period.status === 'LOCKED' ? (
                  <button
                    type="button"
                    className="btn ws-btn-ghost ws-btn-sm"
                    onClick={() => setUnlocking(period.cycleKey)}
                    disabled={busy === period.cycleKey}
                  >
                    Unlock
                  </button>
                ) : period.isCurrent ? (
                  <span className="ws-faint">Still running</span>
                ) : (
                  <button
                    type="button"
                    className="btn ws-btn-primary ws-btn-sm"
                    onClick={() => lock(period.cycleKey)}
                    disabled={busy === period.cycleKey}
                  >
                    {busy === period.cycleKey ? 'Locking…' : 'Lock'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      {unlocking && (
        <div
          className="ws-modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && setUnlocking(null)}
        >
          <div
            className="ws-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ws-unlock-title"
          >
            <div className="ws-modal-head">
              <h2 className="ws-modal-title" id="ws-unlock-title">
                Unlock {unlocking} for {office}
              </h2>
            </div>
            <form onSubmit={unlock}>
              <div className="ws-modal-body">
                <p className="ws-muted">
                  Unlocking makes this cycle editable again. The reason is kept in the audit log and
                  on the period itself, because the point of the lock was that these numbers were
                  signed off.
                </p>
                <label className="form-label ws-label ws-required" htmlFor="unlock-reason">
                  Why are you reopening this period?
                </label>
                <textarea
                  id="unlock-reason"
                  className="form-control"
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
              <div className="ws-modal-foot">
                <button
                  type="button"
                  className="btn ws-btn-ghost"
                  onClick={() => setUnlocking(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn ws-btn-primary"
                  disabled={reason.trim().length < 5 || busy}
                >
                  {busy ? 'Unlocking…' : 'Unlock period'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
