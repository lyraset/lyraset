import Link from 'next/link';
import { DateTime } from 'luxon';
import { requirePagePermission } from '@/lib/workspace/auth';
import { P, ROLE_LABELS } from '@/lib/workspace/permissions';
import { connectDB } from '@/lib/workspace/db';
import AuditLog from '@/models/workspace/AuditLog';
import User from '@/models/workspace/User';
import { escapeRegex } from '@/lib/workspace/validation';
import { TIMEZONE } from '@/lib/workspace/timezone';
import { PageHead, Panel, Empty, TableWrap, formatDateTime } from '@/components/workspace/ui';
import Filters from '@/components/workspace/Filters';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Audit log' };

const PAGE_SIZE = 50;

/**
 * Who changed what, and what it was before.
 *
 * Read-only by design: there is no route in the portal that edits or deletes an
 * entry, so the record of a change cannot itself be quietly changed.
 */
export default async function AuditPage({ searchParams }) {
  await requirePagePermission(P.AUDIT_VIEW);
  const sp = (await searchParams) ?? {};

  const page = Math.max(1, Number(sp.page) || 1);
  const find = {};
  if (typeof sp.action === 'string' && sp.action.trim()) {
    find.action = { $regex: '^' + escapeRegex(sp.action.trim()) };
  }
  if (typeof sp.actorId === 'string' && /^[0-9a-fA-F]{24}$/.test(sp.actorId)) {
    find.actorId = sp.actorId;
  }

  await connectDB();
  const [entries, total, people] = await Promise.all([
    AuditLog.find(find)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    AuditLog.countDocuments(find),
    User.find({}).select('name role').sort({ name: 1 }).lean(),
  ]);

  const byId = new Map(people.map((p) => [String(p._id), p]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageLink = (target) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) {
      if (typeof value === 'string' && key !== 'page') params.set(key, value);
    }
    params.set('page', String(target));
    return '/workspace/audit?' + params.toString();
  };

  return (
    <div className="ws-page">
      <PageHead
        title="Audit log"
        lead={total + ' recorded change(s). Every state change in the portal is written here.'}
      />

      <Panel>
        <Filters
          fields={[
            {
              name: 'action',
              label: 'Action starts with',
              placeholder: 'attendance, leave, employee…',
            },
            {
              name: 'actorId',
              label: 'Who',
              type: 'select',
              options: people.map((p) => ({ value: String(p._id), label: p.name })),
            },
          ]}
        />

        {entries.length === 0 ? (
          <Empty title="Nothing matches">Clear a filter, or check a different page.</Empty>
        ) : (
          <>
            <TableWrap label="Audit log">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">Action</th>
                  <th scope="col">Target</th>
                  <th scope="col" className="ws-wrap">
                    Change
                  </th>
                  <th scope="col">IP</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const actor = entry.actorId ? byId.get(String(entry.actorId)) : null;
                  return (
                    <tr key={String(entry._id)}>
                      <td className="ws-mono ws-muted">{formatDateTime(entry.createdAt)}</td>
                      <td>
                        {actor ? (
                          <>
                            {actor.name}
                            <span className="d-block ws-faint" style={{ fontSize: '0.78rem' }}>
                              {ROLE_LABELS[actor.role]}
                            </span>
                          </>
                        ) : (
                          <span className="ws-muted">System</span>
                        )}
                      </td>
                      <td className="ws-mono">{entry.action}</td>
                      <td className="ws-muted">
                        {entry.targetType ?? '—'}
                        {entry.targetId && (
                          <span className="d-block ws-faint" style={{ fontSize: '0.78rem' }}>
                            {String(entry.targetId).slice(0, 24)}
                          </span>
                        )}
                      </td>
                      <td className="ws-wrap ws-muted" style={{ fontSize: '0.8rem' }}>
                        {summarise(entry)}
                      </td>
                      <td className="ws-mono ws-faint">{entry.ip ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>

            {pages > 1 && (
              <div className="d-flex justify-content-between align-items-center mt-3">
                <span className="ws-muted" style={{ fontSize: '0.875rem' }}>
                  Page {page} of {pages}
                </span>
                <div className="d-flex gap-2">
                  {page > 1 && (
                    <Link href={pageLink(page - 1)} className="btn ws-btn-ghost ws-btn-sm">
                      Previous
                    </Link>
                  )}
                  {page < pages && (
                    <Link href={pageLink(page + 1)} className="btn ws-btn-ghost ws-btn-sm">
                      Next
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

/** A one-line description of what actually changed. */
function summarise(entry) {
  const parts = [];
  if (entry.meta?.reason) parts.push(entry.meta.reason);
  if (entry.meta?.comment) parts.push(entry.meta.comment);
  if (entry.meta?.from && entry.meta?.to) parts.push(entry.meta.from + ' to ' + entry.meta.to);
  if (entry.meta?.dates?.length) parts.push(entry.meta.dates.join(', '));

  const before = entry.before;
  const after = entry.after;
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    const changed = [];
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const a = normalise(before[key]);
      const b = normalise(after[key]);
      if (a !== b) changed.push(key + ': ' + a + ' to ' + b);
    }
    if (changed.length) parts.push(changed.slice(0, 4).join('; '));
  } else if (after?.workDate) {
    parts.push(after.workDate);
  }

  return parts.length ? parts.join(' · ') : '—';
}

function normalise(value) {
  if (value == null) return 'none';
  if (value instanceof Date) return pakistanStamp(value);
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 40);
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}T/.test(text) ? pakistanStamp(text) : text;
}

/** An instant as 'YYYY-MM-DD HH:mm' in Pakistan time. */
function pakistanStamp(value) {
  const dt = DateTime.fromJSDate(new Date(value), { zone: TIMEZONE });
  return dt.isValid ? dt.toFormat('yyyy-MM-dd HH:mm') : String(value);
}
