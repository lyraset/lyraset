import { requirePagePermission } from '@/lib/workspace/auth';
import { P } from '@/lib/workspace/permissions';
import { ensureSettings } from '@/lib/workspace/context';
import { PageHead, Panel } from '@/components/workspace/ui';
import NotificationSettings from '@/components/workspace/NotificationSettings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications' };

export default async function NotificationSettingsPage() {
  await requirePagePermission(P.SETTINGS_MANAGE);
  const settings = await ensureSettings();

  return (
    <div className="ws-page">
      <PageHead
        title="Notifications"
        lead="What the portal sends, and to whom. Everything also appears under the bell whether or not email is on."
      />
      <Panel>
        <NotificationSettings
          values={JSON.parse(JSON.stringify(settings.notifications ?? {}))}
          emailConfigured={Boolean(process.env.RESEND_API_KEY)}
        />
      </Panel>
    </div>
  );
}
