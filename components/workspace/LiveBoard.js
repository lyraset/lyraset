'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from './api';
import { Person, TableWrap, Empty } from './ui';
import { formatDuration } from '@/lib/workspace/calc/attendance';

/**
 * Who is in right now.
 *
 * Refreshes every 60 seconds, and pauses while the tab is hidden — a board
 * left open on a spare monitor overnight should not poll all night.
 */

const LIVE_LABELS = {
  IN: 'In',
  IN_LATE: 'In (late)',
  ON_BREAK: 'On break',
  OUT: 'Clocked out',
  NOT_IN: 'Not in yet',
  ON_LEAVE: 'On leave',
  WFH: 'Work from home',
  OFFICIAL_DUTY: 'Official duty',
  HOLIDAY: 'Holiday',
  WEEKEND: 'Off',
};

const LIVE_BADGE = {
  IN: 'PRESENT',
  IN_LATE: 'LATE',
  ON_BREAK: 'SHORT_LEAVE',
  OUT: 'WEEKEND',
  NOT_IN: 'NOT_MARKED',
  ON_LEAVE: 'ON_LEAVE',
  WFH: 'WFH',
  OFFICIAL_DUTY: 'OFFICIAL_DUTY',
  HOLIDAY: 'HOLIDAY',
  WEEKEND: 'WEEKEND',
};

export default function LiveBoard({ initial = null, canDrillDown = false }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const next = await apiGet('/api/workspace/attendance/live');
        if (!cancelled) {
          setData(next);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };

    const timer = setInterval(load, 60000);
    document.addEventListener('visibilitychange', load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);

  const counts = data?.counts ?? {};
  const rows = data?.rows ?? [];

  return (
    <>
      <div className="ws-live-counts">
        <Count label="In" value={counts.in ?? 0} />
        <Count label="On break" value={counts.onBreak ?? 0} />
        <Count label="Late" value={counts.late ?? 0} />
        <Count label="Not in" value={counts.notIn ?? 0} />
        <Count label="On leave" value={counts.onLeave ?? 0} />
        <Count label="WFH" value={counts.wfh ?? 0} />
        <Count label="Duty" value={counts.officialDuty ?? 0} />
        <Count label="Off" value={counts.off ?? 0} />
      </div>

      {error && (
        <div className="alert alert-warning ws-alert" role="status">
          {error} The board will try again shortly.
        </div>
      )}

      {rows.length === 0 ? (
        <Empty title="Nobody to show">
          Once employees are added and clocking in, they appear here.
        </Empty>
      ) : (
        <TableWrap label="Who is in now">
          <thead>
            <tr>
              <th scope="col">Employee</th>
              <th scope="col">Office</th>
              <th scope="col">Shift</th>
              <th scope="col">In</th>
              <th scope="col">Worked</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId}>
                <td>
                  {canDrillDown ? (
                    <Link href={'/workspace/team/' + row.userId} className="text-decoration-none">
                      <Person name={row.name} meta={row.designation ?? row.department} />
                    </Link>
                  ) : (
                    <Person name={row.name} meta={row.designation ?? row.department} />
                  )}
                </td>
                <td className="ws-muted">{row.office}</td>
                <td className="ws-mono ws-muted">
                  {row.shift ? row.shift.start + '–' + row.shift.end : '—'}
                </td>
                <td className="ws-mono">{row.localClockIn ?? '—'}</td>
                <td className="ws-mono">{formatDuration(row.workedMinutes)}</td>
                <td>
                  <span
                    className={'ws-badge ws-badge-' + (LIVE_BADGE[row.liveStatus] ?? 'NOT_MARKED')}
                  >
                    {LIVE_LABELS[row.liveStatus] ?? row.liveStatus}
                  </span>
                  {row.lateByMinutes > 0 && row.liveStatus !== 'IN_LATE' && (
                    <span className="ws-flag ms-1">{row.lateByMinutes}m late</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {data?.refreshedAt && (
        <p className="ws-faint mt-2 mb-0" style={{ fontSize: '0.8rem' }}>
          Updated{' '}
          {new Date(data.refreshedAt).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
          })}
          . Refreshes every minute.
        </p>
      )}
    </>
  );
}

function Count({ label, value }) {
  return (
    <div className="ws-live-count">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
