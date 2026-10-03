'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiPost, assetUrl } from './api';
import { Empty, Person, StatusBadge, formatDate } from './ui';

/**
 * The approvals inbox.
 *
 * Leave and the other request types share one list because an approver works
 * through them together. Each decision takes a comment, and a leave request
 * can be partly approved by unticking the dates that are not being granted.
 */
export default function ApprovalsInbox({ leaves, requests, filterType }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [comments, setComments] = useState({});
  const [dateSelection, setDateSelection] = useState({});

  const setComment = (id, value) => setComments((c) => ({ ...c, [id]: value }));

  const toggleDate = (requestId, date, allDates) => {
    setDateSelection((current) => {
      const selected = new Set(current[requestId] ?? allDates);
      if (selected.has(date)) selected.delete(date);
      else selected.add(date);
      return { ...current, [requestId]: [...selected] };
    });
  };

  const decideLeave = async (request, decision) => {
    setBusy(request.id);
    setError('');
    try {
      // A request to cancel approved leave is decided as a cancellation:
      // rejecting it keeps the leave, it does not reject the leave itself.
      const cancelling = request.status === 'CANCEL_PENDING';
      const approvedDates =
        decision === 'APPROVE' && !cancelling
          ? (dateSelection[request.id] ?? request.countedDates)
          : null;
      await apiPost('/api/workspace/leave/decide', {
        requestId: request.id,
        decision: cancelling ? decision + '_CANCELLATION' : decision,
        approvedDates,
        comment: comments[request.id]?.trim() || null,
      });
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const decideRequest = async (request, decision) => {
    setBusy(request.id);
    setError('');
    try {
      await apiPost('/api/workspace/approvals/decide', {
        requestId: request.id,
        decision,
        comment: comments[request.id]?.trim() || null,
      });
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const showLeaves = !filterType || filterType === 'LEAVE';
  const showRequests = !filterType || filterType !== 'LEAVE';
  const nothing = (!showLeaves || leaves.length === 0) && (!showRequests || requests.length === 0);

  if (nothing) {
    return (
      <Empty title="Nothing waiting for you">
        Leave applications and requests from the team appear here. Your own never do — nobody
        approves their own request.
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

      {showLeaves &&
        leaves.map((request) => {
          const selected = dateSelection[request.id] ?? request.countedDates;
          const partial = selected.length !== request.countedDates.length;
          return (
            <div className="ws-task" key={request.id}>
              <div className="ws-task-head">
                <Link href={'/workspace/team/' + request.userId} className="text-decoration-none">
                  <Person
                    name={request.userName ?? 'Unknown'}
                    meta={(request.employeeId ?? '') + ' · ' + (request.leaveTypeName ?? 'Leave')}
                  />
                </Link>
                <span>
                  <StatusBadge status={request.status} />
                </span>
              </div>

              <p className="ws-muted mb-2" style={{ fontSize: '0.9rem' }}>
                {formatDate(request.from)}
                {request.from !== request.to ? ' to ' + formatDate(request.to) : ''} ·{' '}
                {request.days} day(s) ({request.paidDays} paid, {request.unpaidDays} unpaid)
                {request.halfDay && ' · half day'}
              </p>

              <p className="mb-2" style={{ fontSize: '0.9rem' }}>
                {request.reason}
              </p>

              {request.attachment && (
                <p className="mb-2" style={{ fontSize: '0.875rem' }}>
                  <a
                    href={assetUrl(request.attachment.publicId, {
                      resourceType: request.attachment.resourceType ?? 'image',
                    })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open attached document
                  </a>
                </p>
              )}

              {request.status !== 'CANCEL_PENDING' && request.countedDates.length > 1 && (
                <fieldset className="border-0 p-0 mb-2">
                  <legend className="ws-label-sm">Days to approve</legend>
                  <div className="d-flex flex-wrap gap-2">
                    {request.countedDates.map((date) => (
                      <div className="form-check" key={date}>
                        <input
                          id={request.id + '-' + date}
                          type="checkbox"
                          className="form-check-input"
                          checked={selected.includes(date)}
                          onChange={() => toggleDate(request.id, date, request.countedDates)}
                        />
                        <label className="form-check-label" htmlFor={request.id + '-' + date}>
                          {formatDate(date)}
                        </label>
                      </div>
                    ))}
                  </div>
                  {partial && (
                    <p className="form-text">
                      Approving {selected.length} of {request.countedDates.length} days.
                    </p>
                  )}
                </fieldset>
              )}

              <Decision
                id={request.id}
                busy={busy === request.id}
                comment={comments[request.id] ?? ''}
                onComment={(value) => setComment(request.id, value)}
                approveLabel={
                  request.status === 'CANCEL_PENDING'
                    ? 'Approve cancellation'
                    : partial
                      ? 'Approve selected days'
                      : 'Approve leave'
                }
                rejectLabel={request.status === 'CANCEL_PENDING' ? 'Reject cancellation' : 'Reject'}
                onApprove={() => decideLeave(request, 'APPROVE')}
                onReject={() => decideLeave(request, 'REJECT')}
                disableApprove={request.status !== 'CANCEL_PENDING' && selected.length === 0}
              />
            </div>
          );
        })}

      {showRequests &&
        requests.map((request) => (
          <div className="ws-task" key={request.id}>
            <div className="ws-task-head">
              <Link href={'/workspace/team/' + request.userId} className="text-decoration-none">
                <Person
                  name={request.userName ?? 'Unknown'}
                  meta={(request.employeeId ?? '') + ' · ' + request.typeLabel}
                />
              </Link>
              <span>
                <StatusBadge status={request.status} />
              </span>
            </div>

            <p className="ws-muted mb-2" style={{ fontSize: '0.9rem' }}>
              {request.dates.length === 1
                ? formatDate(request.dates[0])
                : formatDate(request.dates[0]) + ' to ' + formatDate(request.dates.at(-1))}
              {request.payload?.clockIn && ' · in ' + request.payload.clockIn}
              {request.payload?.clockOut && ' · out ' + request.payload.clockOut}
              {request.payload?.location && ' · ' + request.payload.location}
              {request.payload?.minutes && ' · ' + request.payload.minutes + ' minutes claimed'}
            </p>

            <p className="mb-2" style={{ fontSize: '0.9rem' }}>
              {request.reason}
            </p>

            {request.evidence && (
              <p className="mb-2" style={{ fontSize: '0.875rem' }}>
                <a
                  href={assetUrl(request.evidence.publicId, {
                    resourceType: request.evidence.resourceType ?? 'image',
                  })}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open evidence
                </a>
              </p>
            )}

            <Decision
              id={request.id}
              busy={busy === request.id}
              comment={comments[request.id] ?? ''}
              onComment={(value) => setComment(request.id, value)}
              approveLabel={'Approve ' + request.typeLabel.toLowerCase()}
              onApprove={() => decideRequest(request, 'APPROVE')}
              onReject={() => decideRequest(request, 'REJECT')}
            />
          </div>
        ))}
    </>
  );
}

function Decision({
  id,
  busy,
  comment,
  onComment,
  approveLabel,
  rejectLabel = 'Reject',
  onApprove,
  onReject,
  disableApprove,
}) {
  return (
    <div className="row g-2 align-items-end">
      <div className="col-12 col-md-6">
        <label className="form-label ws-label" htmlFor={'comment-' + id}>
          Comment (optional)
        </label>
        <input
          id={'comment-' + id}
          className="form-control"
          maxLength={1000}
          value={comment}
          onChange={(e) => onComment(e.target.value)}
          placeholder="Shown to the employee with the decision"
        />
      </div>
      <div className="col-12 col-md-6 d-flex gap-2">
        <button
          type="button"
          className="btn ws-btn-primary"
          onClick={onApprove}
          disabled={busy || disableApprove}
        >
          {busy ? 'Working…' : approveLabel}
        </button>
        <button type="button" className="btn ws-btn-danger" onClick={onReject} disabled={busy}>
          {rejectLabel}
        </button>
      </div>
    </div>
  );
}
