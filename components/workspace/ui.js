import { STATUS_LABELS, formatDuration } from '@/lib/workspace/calc/attendance';

/**
 * Small presentational pieces shared across the portal.
 * Server components: no state, no effects, so they can render anywhere.
 */

const REQUEST_STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  PARTIALLY_APPROVED: 'Partly approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  CANCEL_PENDING: 'Cancellation pending',
};

export function StatusBadge({ status, label = null }) {
  if (!status) return null;
  const text = label ?? STATUS_LABELS[status] ?? REQUEST_STATUS_LABELS[status] ?? status;
  return <span className={'ws-badge ws-badge-' + status}>{text}</span>;
}

export function Flags({ flags = [], hide = [] }) {
  const shown = flags.filter((f) => !hide.includes(f));
  if (!shown.length) return null;
  return (
    <>
      {shown.map((flag) => (
        <span key={flag} className="ws-flag">
          {STATUS_LABELS[flag] ?? flag}
        </span>
      ))}
    </>
  );
}

export function Stat({ label, value, note = null }) {
  return (
    <div className="ws-stat">
      <p className="ws-stat-label">{label}</p>
      <p className="ws-stat-value">{value}</p>
      {note && <p className="ws-stat-note">{note}</p>}
    </div>
  );
}

/**
 * Empty states say what to do next rather than only that there is nothing —
 * an employee seeing "No EODs yet" should know how one gets created.
 */
export function Empty({ title, children }) {
  return (
    <div className="ws-empty">
      <p className="ws-empty-title">{title}</p>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Panel({ title, action = null, tight = false, children }) {
  return (
    <section className={'ws-panel' + (tight ? ' ws-panel-tight' : '')}>
      {(title || action) && (
        <div className="ws-panel-head">
          {title && <h2 className="ws-panel-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHead({ title, lead = null, actions = null }) {
  return (
    <div className="ws-page-head">
      <div>
        <h1 className="ws-page-title">{title}</h1>
        {lead && <p className="ws-page-lead">{lead}</p>}
      </div>
      {actions && <div className="ws-page-actions">{actions}</div>}
    </div>
  );
}

/** Wide tables scroll inside this, never the page body. */
export function TableWrap({ children, label }) {
  return (
    <div className="ws-table-wrap" tabIndex={0} role="region" aria-label={label}>
      <table className="ws-table">{children}</table>
    </div>
  );
}

export function Avatar({ name }) {
  const initials = String(name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <span className="ws-avatar" aria-hidden="true">
      {initials}
    </span>
  );
}

export function Person({ name, meta = null }) {
  return (
    <span className="ws-person">
      <Avatar name={name} />
      <span style={{ minWidth: 0 }}>
        <p className="ws-person-name">{name}</p>
        {meta && <p className="ws-person-meta">{meta}</p>}
      </span>
    </span>
  );
}

export { formatDuration };

/** '14 Mar 2026' — unambiguous for both offices, unlike a numeric date. */
export function formatDate(value, { weekday = false } = {}) {
  if (!value) return '—';
  const date =
    typeof value === 'string' && value.length === 10
      ? new Date(value + 'T00:00:00Z')
      : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    ...(weekday ? { weekday: 'short' } : {}),
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** A timestamp rendered in a named zone, so Dubai rows read as Dubai time. */
export function formatTimeIn(value, timeZone) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  });
}
