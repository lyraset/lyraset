import { api, json, requireCronSecret } from '@/lib/workspace/route';
import { sendClockInReminders, sendClockOutReminders } from '@/lib/workspace/services/cron';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Clock-in and clock-out reminders.
 *
 * On the Hobby plan this fires once a day, which only catches the shifts due
 * around that hour. The README explains which schedule to tighten on Pro; the
 * dedupe key means running it every 15 minutes there sends nothing twice.
 */
export const GET = api(async (req) => {
  requireCronSecret(req);
  const [clockIn, clockOut] = await Promise.all([sendClockInReminders(), sendClockOutReminders()]);
  return json({ ok: true, clockIn, clockOut });
});

export const POST = GET;
