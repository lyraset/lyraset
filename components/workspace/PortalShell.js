'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_GROUPS } from '@/lib/workspace/navigation';
import { apiGet, apiPost } from './api';
import BrandMark from './BrandMark';
import NavIcon from './NavIcon';
import ThemeToggle from './ThemeToggle';

/** Where the collapsed/expanded choice is remembered, per browser. */
const COLLAPSED_KEY = 'lyraset.workspace.navCollapsed';

/**
 * The portal shell: sidebar on desktop, a collapsing top bar on phones.
 *
 * The navigation it renders has already been filtered by permission on the
 * server, so this component never decides who may see what — it only lays out
 * what it was given.
 *
 * On desktop the sidebar collapses to a rail of icons, which is remembered for
 * next time. On a phone it is the Menu button that opens and closes it, so the
 * two never fight each other.
 */
export default function PortalShell({ nav, user, roleLabel, children }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // A tap on a link should close the menu, not leave it covering the page.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Read after mount, never during render: the server cannot know this, and a
  // different first render in the browser would break hydration.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === 'true');
    } catch {
      // Private browsing, or storage turned off. The sidebar simply starts open.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, String(next));
      } catch {
        // Not worth telling anyone about: it only costs them the preference.
      }
      return next;
    });
  };

  const isCurrent = (href) =>
    href === '/workspace' ? pathname === '/workspace' : pathname.startsWith(href);

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: nav.filter((item) => item.group === group.id),
  })).filter((group) => group.items.length);

  return (
    <div className="ws-shell">
      <div className="ws-mobile-bar">
        <BrandMark size={24} />
        <div className="d-flex align-items-center gap-2">
          <ThemeToggle />
          <NotificationBell />
          <button
            type="button"
            className="btn ws-btn-ghost ws-btn-sm"
            onClick={() => setNavOpen((open) => !open)}
            aria-expanded={navOpen}
            aria-controls="ws-sidebar"
          >
            {navOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      {/* Always in the DOM: CSS shows it as a sidebar on desktop and collapses
          it behind the Menu button only at phone width. */}
      <aside
        className="ws-sidebar"
        id="ws-sidebar"
        data-open={navOpen ? 'true' : 'false'}
        data-collapsed={collapsed ? 'true' : 'false'}
      >
        <div className="ws-sidebar-head">
          <BrandMark size={26} />
          <button
            type="button"
            className="ws-collapse"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="ws-sidebar"
            aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}
            title={collapsed ? 'Expand the menu' : 'Collapse the menu'}
          >
            <NavIcon name={collapsed ? 'chevronRight' : 'chevronLeft'} />
          </button>
        </div>

        <nav className="ws-nav" aria-label="Workspace">
          {groups.map((group) => (
            <div className="ws-nav-group" key={group.id}>
              <p className="ws-nav-group-title">{group.label}</p>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="ws-nav-link"
                  aria-current={isCurrent(item.href) ? 'page' : undefined}
                  // The label is the only thing left once the rail collapses.
                  title={collapsed ? item.label : undefined}
                >
                  <NavIcon name={item.icon} />
                  <span className="ws-nav-label">{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="ws-user">
          <p className="ws-user-name">{user.name}</p>
          <p className="ws-user-role">
            {roleLabel} · {user.employeeId}
          </p>
          <form action="/api/workspace/auth/logout" method="post">
            <button type="submit" className="btn ws-btn-ghost w-100" title="Sign out">
              <NavIcon name="signOut" />
              <span className="ws-nav-label">Sign out</span>
            </button>
          </form>
        </div>
      </aside>

      <main className="ws-main">
        <div className="ws-topbar d-none d-lg-flex">
          <span />
          <div className="ws-topbar-actions">
            <ThemeToggle />
            <NotificationBell />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

/** The bell: unread count, and the latest notifications on click. */
function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ notifications: [], unread: 0 });
  const wrapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiGet('/api/workspace/notifications');
        if (!cancelled) setState(data);
      } catch {
        // The bell is not worth interrupting anyone over.
      }
    };
    load();
    const timer = setInterval(load, 120000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markAllRead = async () => {
    try {
      await apiPost('/api/workspace/notifications', { action: 'MARK_READ' });
      setState((prev) => ({
        unread: 0,
        notifications: prev.notifications.map((n) => ({ ...n, read: true })),
      }));
    } catch {
      // Leave the badge as it is; the next poll will correct it.
    }
  };

  return (
    <span className="ws-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="ws-bell"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={state.unread ? state.unread + ' unread notifications' : 'Notifications'}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path
            d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {state.unread > 0 && (
          <span className="ws-bell-count">{state.unread > 99 ? '99+' : state.unread}</span>
        )}
      </button>

      {open && (
        <div className="ws-bell-panel" role="dialog" aria-label="Notifications">
          <div className="d-flex justify-content-between align-items-center px-2 pb-2">
            <strong style={{ fontSize: '0.9rem' }}>Notifications</strong>
            {state.unread > 0 && (
              <button type="button" className="btn ws-btn-ghost ws-btn-sm" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {state.notifications.length === 0 ? (
            <p className="ws-muted px-2 py-3 mb-0" style={{ fontSize: '0.875rem' }}>
              Nothing yet. Reminders and decisions on your requests will appear here.
            </p>
          ) : (
            state.notifications.map((item) => (
              <Link
                key={item.id}
                href={item.link || '/workspace'}
                className={'ws-bell-item' + (item.read ? '' : ' is-unread')}
                onClick={() => setOpen(false)}
              >
                <p className="ws-bell-item-title">{item.title}</p>
                {item.message && <p className="ws-bell-item-body">{item.message}</p>}
              </Link>
            ))
          )}
        </div>
      )}
    </span>
  );
}
