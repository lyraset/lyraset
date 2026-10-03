import Link from 'next/link';
import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { PageHead, Panel } from '@/components/workspace/ui';
import { SETTINGS_NAV } from './nav';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

const DESCRIPTIONS = {
  '/workspace/settings/company':
    'The company month, leave quota, late-to-deduction rule, half-day threshold, auto clock-out and EOD rules.',
  '/workspace/settings/shifts':
    'Weekly shifts, day by day, with grace minutes and a flexible option.',
  '/workspace/settings/schedules':
    'Date-range overrides such as Ramadan timings or a one-off early close.',
  '/workspace/settings/leave-types':
    'What kinds of leave people can apply for, and the rules for each.',
  '/workspace/settings/holidays': 'The public holiday calendar and one-off closures.',
  '/workspace/settings/projects': 'The clients and projects EOD tasks are filed against.',
  '/workspace/settings/departments':
    'The department list used across profiles, filters and reports.',
  '/workspace/settings/offices': 'Weekend, IP allowlist and geofence rules for the office.',
  '/workspace/settings/notifications':
    'Which reminders and summaries are sent, and whether email is on.',
};

export default async function SettingsIndex() {
  await requirePagePermission(P.SETTINGS_MANAGE);

  return (
    <div className="ws-page">
      <PageHead
        title="Settings"
        lead="Everything that changes how attendance, leave and reports behave. Every change is audited."
      />

      <div className="ws-grid ws-grid-2">
        {SETTINGS_NAV.map((item) => (
          <Link key={item.href} href={item.href} className="text-decoration-none">
            <Panel title={item.label}>
              <p className="ws-muted mb-0" style={{ fontSize: '0.9rem' }}>
                {DESCRIPTIONS[item.href]}
              </p>
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
