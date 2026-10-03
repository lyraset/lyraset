/**
 * The office is in Pakistan, so the portal runs on Pakistan time — every work
 * date, lateness check, cycle boundary and displayed time, for everyone.
 *
 * Nothing may fall back to the server's own zone (UTC on Vercel) or to the
 * viewer's browser zone: between midnight and 05:00 in Pakistan those disagree
 * about what "today" is, and every displayed time would be five hours off.
 *
 * No imports, so it is safe in the browser, on the server and in middleware.
 */

export const TIMEZONE = 'Asia/Karachi';

/** How the zone is named on screen. */
export const TIMEZONE_LABEL = 'Pakistan time (PKT)';

const dateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in Pakistan, as 'YYYY-MM-DD'. */
export function todayInPakistan(now = new Date()) {
  const parts = dateParts.formatToParts(now);
  const part = (type) => parts.find((p) => p.type === type).value;
  return part('year') + '-' + part('month') + '-' + part('day');
}
