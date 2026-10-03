'use client';

import { useEffect, useState } from 'react';
import NavIcon from './NavIcon';

/**
 * Light / dark switch.
 *
 * The theme itself is set by the inline script in app/workspace/layout.js, which
 * runs before the page paints; this only reads what that decided and changes it.
 * Until it has mounted it renders no icon, so the server's HTML and the first
 * render in the browser match and hydration stays clean.
 */

/** Shared with the inline script in app/workspace/layout.js. */
const THEME_KEY = 'lyraset.workspace.theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    setTheme(document.body.getAttribute('data-ws-theme') === 'light' ? 'light' : 'dark');
  }, []);

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-ws-theme', next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage is off: the choice holds for this visit and no longer.
    }
    setTheme(next);
  };

  const label = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';

  return (
    <button type="button" className="ws-bell" onClick={toggle} aria-label={label} title={label}>
      {theme && <NavIcon name={theme === 'light' ? 'moon' : 'sun'} />}
    </button>
  );
}
