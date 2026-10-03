/**
 * The sidebar's icons.
 *
 * Inline SVG rather than an icon package: there are fifteen of them, they never
 * change, and a dependency would cost more than the markup. They draw in
 * `currentColor`, so each icon takes the colour of the link it sits in — muted,
 * or bright on the current page — with no extra rules.
 */

const PATHS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.75V12l3.25 2" />
    </>
  ),
  report: (
    <>
      <path d="M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5L14 3Z" />
      <path d="M13.75 3v4.5h4.5" />
      <path d="M9 13h6M9 16.5h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>
  ),
  inbox: (
    <>
      <path d="M5.75 4h12.5l2.75 8.5v5a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 17.5v-5L5.75 4Z" />
      <path d="M3 12.5h5l1.25 2.75h5.5L16 12.5h5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.75 20a7.25 7.25 0 0 1 14.5 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9.25" cy="8" r="3.5" />
      <path d="M2.75 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16.5 5.1a3.5 3.5 0 0 1 0 6.8" />
      <path d="M17.75 14.5A6.5 6.5 0 0 1 21.25 19" />
    </>
  ),
  clipboard: (
    <>
      <path d="M8.5 4.5H7A1.5 1.5 0 0 0 5.5 6v13.5A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 17 4.5h-1.5" />
      <rect x="8.5" y="3" width="7" height="3.25" rx="1" />
      <path d="M9 11.5h6M9 15h4" />
    </>
  ),
  calendarDays: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <circle cx="8.25" cy="14" r="1" />
      <circle cx="12" cy="14" r="1" />
      <circle cx="15.75" cy="14" r="1" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20h16" />
      <rect x="5.5" y="11" width="3.5" height="6" rx="1" />
      <rect x="10.25" y="6.5" width="3.5" height="10.5" rx="1" />
      <rect x="15" y="13.5" width="3.5" height="3.5" rx="1" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.25 12.25 2.5 2.5 5-5.5" />
    </>
  ),
  idCard: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <circle cx="8.5" cy="10.75" r="2.25" />
      <path d="M5.25 16.25a3.6 3.6 0 0 1 6.5 0" />
      <path d="M14.75 9.5h4M14.75 13.5h4" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7.5h8.5M17.5 7.5H20M4 16.5h3.5M12.5 16.5H20" />
      <circle cx="15" cy="7.5" r="2.5" />
      <circle cx="10" cy="16.5" r="2.5" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2" />
      <path d="M8 10V7.25a4 4 0 0 1 8 0V10" />
    </>
  ),
  ledger: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9.5 8.5h5M9.5 12.5h5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 13.5A8.5 8.5 0 1 1 10.5 4a6.75 6.75 0 0 0 9.5 9.5Z" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  signOut: (
    <>
      <path d="M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14" />
      <path d="M10 8.5 6 12l4 3.5M6 12h9" />
    </>
  ),
};

export default function NavIcon({ name }) {
  const shape = PATHS[name];
  if (!shape) return null;
  return (
    <svg
      className="ws-nav-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shape}
    </svg>
  );
}
