'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, uploadPrivateFile, issuesByField } from './api';
import { todayInPakistan } from '@/lib/workspace/timezone';

/**
 * The leave application.
 *
 * It prices itself as you type: every change asks the server what the request
 * would cost, so "2 of these days are beyond your quota and will be unpaid" is
 * on screen before anyone submits, rather than arriving as a rejection later.
 */
export default function LeaveForm({ leaveTypes, balance }) {
  const router = useRouter();
  const today = todayInPakistan();

  const [leaveTypeId, setLeaveTypeId] = useState(leaveTypes[0]?.id ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const selected = leaveTypes.find((t) => t.id === leaveTypeId) ?? null;
  const singleDay = Boolean(from && to && from === to);

  const priceIt = useCallback(async () => {
    if (!leaveTypeId || !from || !to || to < from) {
      setQuote(null);
      setQuoteError('');
      return;
    }
    try {
      const result = await apiPost('/api/workspace/leave/quote', {
        leaveTypeId,
        from,
        to,
        halfDay: halfDay && from === to,
        hasDocument: Boolean(attachment),
      });
      setQuote(result);
      setQuoteError('');
    } catch (err) {
      setQuote(null);
      setQuoteError(err.message);
    }
  }, [leaveTypeId, from, to, halfDay, attachment]);

  // Debounced so dragging through a date picker does not spam the server.
  useEffect(() => {
    const timer = setTimeout(priceIt, 350);
    return () => clearTimeout(timer);
  }, [priceIt]);

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      setAttachment(await uploadPrivateFile(file, 'LEAVE'));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    setSaving(true);
    try {
      await apiPost('/api/workspace/leave', {
        leaveTypeId,
        from,
        to,
        halfDay: halfDay && singleDay,
        reason: reason.trim(),
        attachment,
      });
      setFrom('');
      setTo('');
      setReason('');
      setAttachment(null);
      setQuote(null);
      router.refresh();
    } catch (err) {
      setError(err.message);
      setFieldErrors(issuesByField(err));
    } finally {
      setSaving(false);
    }
  };

  const blocked = Boolean(quote?.blocked) || (quote?.problems?.length ?? 0) > 0;

  return (
    <form onSubmit={submit}>
      <div className="row g-3">
        <div className="col-12 col-md-6">
          <label className="form-label ws-label ws-required" htmlFor="leave-type">
            Leave type
          </label>
          <select
            id="leave-type"
            className="form-select"
            value={leaveTypeId}
            onChange={(e) => setLeaveTypeId(e.target.value)}
          >
            {leaveTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name} ({type.paid ? 'paid' : 'unpaid'})
              </option>
            ))}
          </select>
          {selected?.requiresDocument && (
            <p className="form-text">
              {selected.documentAfterDays > 0
                ? 'A certificate is needed for more than ' + selected.documentAfterDays + ' day(s).'
                : 'A supporting document is required.'}
            </p>
          )}
        </div>

        <div className="col-6 col-md-3">
          <label className="form-label ws-label ws-required" htmlFor="leave-from">
            From
          </label>
          <input
            id="leave-from"
            type="date"
            className="form-control"
            min={today}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              if (!to || to < e.target.value) setTo(e.target.value);
            }}
          />
          {fieldErrors.from && <p className="ws-field-error">{fieldErrors.from}</p>}
        </div>

        <div className="col-6 col-md-3">
          <label className="form-label ws-label ws-required" htmlFor="leave-to">
            To
          </label>
          <input
            id="leave-to"
            type="date"
            className="form-control"
            min={from || today}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          {fieldErrors.to && <p className="ws-field-error">{fieldErrors.to}</p>}
        </div>

        {singleDay && selected?.allowHalfDay !== false && (
          <div className="col-12">
            <div className="form-check">
              <input
                id="leave-half"
                type="checkbox"
                className="form-check-input"
                checked={halfDay}
                onChange={(e) => setHalfDay(e.target.checked)}
              />
              <label className="form-check-label" htmlFor="leave-half">
                Half day
              </label>
            </div>
          </div>
        )}

        <div className="col-12">
          <label className="form-label ws-label ws-required" htmlFor="leave-reason">
            Reason
          </label>
          <textarea
            id="leave-reason"
            className="form-control"
            rows={2}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {fieldErrors.reason && <p className="ws-field-error">{fieldErrors.reason}</p>}
        </div>

        <div className="col-12">
          <label className="form-label ws-label" htmlFor="leave-doc">
            Supporting document {selected?.requiresDocument ? '' : '(optional)'}
          </label>
          <input
            id="leave-doc"
            type="file"
            className="form-control"
            onChange={onFile}
            disabled={uploading}
          />
          {uploading && <p className="form-text">Uploading…</p>}
          {attachment && (
            <p className="form-text">
              Attached: {attachment.filename}{' '}
              <button
                type="button"
                className="btn ws-btn-ghost ws-btn-sm"
                onClick={() => setAttachment(null)}
              >
                Remove
              </button>
            </p>
          )}
        </div>
      </div>

      <div className="ws-summary-row mt-3">
        <div className="ws-summary-item">
          <p className="ws-label-sm">Paid leave left this cycle</p>
          <p className="ws-mono">{balance ? balance.remaining : '—'}</p>
        </div>
        <div className="ws-summary-item">
          <p className="ws-label-sm">This request costs</p>
          <p className="ws-mono">{quote ? quote.days + ' day(s)' : '—'}</p>
        </div>
        <div className="ws-summary-item">
          <p className="ws-label-sm">Paid / unpaid</p>
          <p className="ws-mono">{quote ? quote.paidDays + ' / ' + quote.unpaidDays : '—'}</p>
        </div>
      </div>

      {quote?.splits?.length > 1 && (
        <p className="ws-muted" style={{ fontSize: '0.875rem' }}>
          This request crosses a company month, so it is charged to each cycle separately:{' '}
          {quote.splits.map((s) => s.cycleKey + ' (' + s.days + ')').join(', ')}.
        </p>
      )}

      {quote?.notes?.map((note) => (
        <div className="alert alert-warning ws-alert" role="status" key={note}>
          {note}
        </div>
      ))}

      {quote?.problems?.map((problem) => (
        <div className="alert alert-danger ws-alert" role="alert" key={problem}>
          {problem}
        </div>
      ))}

      {quoteError && (
        <div className="alert alert-warning ws-alert" role="status">
          {quoteError}
        </div>
      )}

      {error && (
        <div className="alert alert-danger ws-alert" role="alert">
          {error}
        </div>
      )}

      <button
        type="submit"
        className="btn ws-btn-primary"
        disabled={saving || uploading || !quote || blocked || !reason.trim()}
      >
        {saving ? 'Submitting…' : 'Apply for leave'}
      </button>
    </form>
  );
}
