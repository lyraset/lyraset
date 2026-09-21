'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import EodDialog from './EodDialog';
import Filters from './Filters';
import { Panel, Empty, StatusBadge, formatDate, formatDuration } from './ui';

/**
 * A list of days with their reports, and the two ways a report can change:
 * submitting one for a day that was auto-closed, and editing one inside the
 * Owner's window. Both open the same dialog the clock-out uses.
 */
export default function EodHistory({
  rows,
  userId,
  projects,
  minDescription,
  editWindowHours,
  from,
  to,
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  const toggle = (workDate) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(workDate)) next.delete(workDate);
      else next.add(workDate);
      return next;
    });

  const onDone = () => {
    setDialog(null);
    router.refresh();
  };

  return (
    <>
      <Panel>
        <Filters
          fields={[
            { name: 'from', label: 'From', type: 'date' },
            { name: 'to', label: 'To', type: 'date' },
          ]}
        />

        {rows.length === 0 ? (
          <Empty title="No days with hours in this range">
            An EOD is created when you clock out. Days you clocked in on will appear here.
          </Empty>
        ) : (
          <ul className="list-unstyled mb-0">
            {rows.map((row) => (
              <li className="ws-task" key={row.workDate}>
                <div className="ws-task-head">
                  <div>
                    <p className="mb-1" style={{ fontWeight: 600 }}>
                      {formatDate(row.workDate, { weekday: true })}
                    </p>
                    <p className="ws-person-meta mb-0">
                      {formatDuration(row.workedMinutes)} worked{' '}
                      <StatusBadge status={row.attendanceStatus} />
                      {row.eod?.lateSubmission && (
                        <span className="ws-flag ms-1">Late submission</span>
                      )}
                      {row.eod?.edited && <span className="ws-flag ms-1">Edited</span>}
                    </p>
                  </div>

                  <div className="d-flex gap-2 flex-wrap">
                    {row.eod ? (
                      <>
                        <button
                          type="button"
                          className="btn ws-btn-ghost ws-btn-sm"
                          onClick={() => toggle(row.workDate)}
                          aria-expanded={expanded.has(row.workDate)}
                        >
                          {expanded.has(row.workDate) ? 'Hide' : 'View'}
                        </button>
                        {row.eod.editable && (
                          <button
                            type="button"
                            className="btn ws-btn-ghost ws-btn-sm"
                            onClick={() =>
                              setDialog({ mode: 'EDIT', workDate: row.workDate, eod: row.eod })
                            }
                          >
                            Edit
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn ws-btn-primary ws-btn-sm"
                        onClick={() =>
                          setDialog({ mode: 'LATE', workDate: row.workDate, eod: null })
                        }
                      >
                        Submit EOD
                      </button>
                    )}
                  </div>
                </div>

                {!row.eod && (
                  <p className="ws-muted mb-0" style={{ fontSize: '0.875rem' }}>
                    {row.autoClosed
                      ? 'This day was clocked out automatically, so the report is still missing.'
                      : 'No report for this day yet.'}
                  </p>
                )}

                {row.eod && expanded.has(row.workDate) && (
                  <div className="mt-2">
                    {row.eod.tasks.map((task, index) => (
                      <div key={index} className="mb-2">
                        <p className="mb-1" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                          {task.title}
                          <span className="ws-flag ms-2">
                            {task.projectName ?? 'Internal / Other'}
                          </span>
                          <StatusBadge
                            status={task.status === 'COMPLETED' ? 'APPROVED' : 'PENDING'}
                            label={
                              task.status === 'COMPLETED'
                                ? 'Completed'
                                : task.status === 'IN_PROGRESS'
                                  ? 'In progress'
                                  : 'Blocked'
                            }
                          />
                        </p>
                        <p className="ws-muted mb-0" style={{ fontSize: '0.875rem' }}>
                          {task.description}
                          {task.minutes ? ' · ' + formatDuration(task.minutes) : ''}
                        </p>
                      </div>
                    ))}
                    {row.eod.blockers && (
                      <p className="ws-muted mb-1" style={{ fontSize: '0.875rem' }}>
                        <strong>Blockers:</strong> {row.eod.blockers}
                      </p>
                    )}
                    {row.eod.tomorrowPlan && (
                      <p className="ws-muted mb-0" style={{ fontSize: '0.875rem' }}>
                        <strong>Tomorrow:</strong> {row.eod.tomorrowPlan}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="ws-faint" style={{ fontSize: '0.82rem' }}>
        {editWindowHours > 0
          ? 'You can edit a report for ' +
            editWindowHours +
            ' hours after submitting it. After that, ask for a correction.'
          : 'Reports cannot be edited once submitted. Ask for a correction if something is wrong.'}
      </p>

      {dialog && (
        <EodDialog
          open
          onClose={() => setDialog(null)}
          onDone={onDone}
          userId={userId}
          workDate={dialog.workDate}
          projects={projects}
          minDescription={minDescription}
          mode={dialog.mode}
          initial={dialog.eod}
          eodId={dialog.eod?.id}
        />
      )}
    </>
  );
}
