'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPatch } from './api';
import { StatusBadge, TableWrap, Empty, formatDate } from './ui';

/**
 * A list of leave requests, with the one action the employee owns: cancelling.
 *
 * A pending request is withdrawn outright. An approved future one has to go
 * back for approval, because releasing the days unilaterally would let someone
 * quietly reclaim quota they had already spent.
 */
export default function LeaveList({ requests, canCancel = false }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const cancel = async (id) => {
    setBusy(id);
    setError('');
    try {
      await apiPatch('/api/workspace/leave/' + id, { action: 'CANCEL' });
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (!requests.length) {
    return (
      <Empty title="No leave requests yet">
        Apply above and it will appear here with its status.
      </Empty>
    );
  }

  return (
    <>
      {error && (
        <div className="alert alert-danger ws-alert" role="alert">
          {error}
        </div>
      )}

      <TableWrap label="Leave requests">
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Dates</th>
            <th scope="col" className="ws-num">
              Days
            </th>
            <th scope="col" className="ws-num">
              Paid
            </th>
            <th scope="col" className="ws-num">
              Unpaid
            </th>
            <th scope="col" className="ws-wrap">
              Reason
            </th>
            <th scope="col">Status</th>
            {canCancel && <th scope="col">Action</th>}
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id}>
              <td>
                <span
                  className="ws-cal-dot me-2"
                  style={{ background: request.leaveTypeColor ?? '#3d7bff' }}
                  aria-hidden="true"
                />
                {request.leaveTypeName ?? 'Leave'}
              </td>
              <td>
                {formatDate(request.from)}
                {request.from !== request.to ? ' to ' + formatDate(request.to) : ''}
                {request.halfDay && <span className="ws-flag ms-1">Half day</span>}
              </td>
              <td className="ws-num ws-mono">{request.days}</td>
              <td className="ws-num ws-mono">{request.paidDays}</td>
              <td className="ws-num ws-mono">{request.unpaidDays}</td>
              <td className="ws-wrap ws-muted">
                {request.reason}
                {request.reviewComment && (
                  <span className="d-block ws-faint">Reviewer: {request.reviewComment}</span>
                )}
              </td>
              <td>
                <StatusBadge status={request.status} />
              </td>
              {canCancel && (
                <td>
                  {['PENDING', 'APPROVED', 'PARTIALLY_APPROVED'].includes(request.status) ? (
                    <button
                      type="button"
                      className="btn ws-btn-ghost ws-btn-sm"
                      onClick={() => cancel(request.id)}
                      disabled={busy === request.id}
                    >
                      {busy === request.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  ) : (
                    <span className="ws-faint">—</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}
