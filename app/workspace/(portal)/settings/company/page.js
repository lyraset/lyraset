import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { ensureSettings, getWorkspaceContext } from '@/lib/workspace/context';
import { getCycleForDate, getNextCycle } from '@/lib/workspace/calc/cycle';
import { TIMEZONE } from '@/lib/workspace/timezone';
import { PageHead, Panel, formatDate } from '@/components/workspace/ui';
import CompanySettingsForm from '@/components/workspace/CompanySettingsForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Company settings' };

export default async function CompanySettingsPage() {
  await requirePagePermission(P.SETTINGS_MANAGE);

  const settings = await ensureSettings();
  const ctx = await getWorkspaceContext();
  const now = new Date();
  const currentCycle = getCycleForDate(now, ctx.cycleHistory, TIMEZONE);
  const nextCycle = getNextCycle(now, ctx.cycleHistory, TIMEZONE);
  const history = ctx.cycleHistory ?? [];

  return (
    <div className="ws-page">
      <PageHead
        title="Company month & rules"
        lead="These settings decide how every cycle, status and quota is calculated."
      />

      <CompanySettingsForm
        settings={JSON.parse(JSON.stringify(settings))}
        currentCycle={currentCycle}
        nextCycle={nextCycle}
        cycleStartDay={history.at(-1)?.day ?? 1}
      />

      {history.length > 1 && (
        <Panel title="Start-day history">
          <dl className="ws-kv mb-0">
            {[...history].reverse().map((entry, index) => (
              <div key={index} style={{ display: 'contents' }}>
                <dt>Day {entry.day}</dt>
                <dd>From {formatDate(entry.effectiveFrom)}</dd>
              </div>
            ))}
          </dl>
          <p className="ws-faint mt-2 mb-0" style={{ fontSize: '0.82rem' }}>
            Each cycle uses the start day that was in force when it began, so changing this never
            moves a cycle that has already been reported.
          </p>
        </Panel>
      )}
    </div>
  );
}
