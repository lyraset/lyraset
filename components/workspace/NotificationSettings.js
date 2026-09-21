'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPatch } from './api';

/**
 * Notification toggles.
 *
 * Account notices — a password reset, a deactivation — are deliberately not
 * listed: they are never switched off, because an account changing under
 * someone is not optional information.
 */
const TOGGLES = [
  {
    name: 'clockInReminder',
    label: 'Clock-in reminder',
    hint: 'Sent 15 minutes after a shift starts, to anyone who has not clocked in. Skips leave and holidays.',
  },
  {
    name: 'clockOutReminder',
    label: 'Clock-out reminder',
    hint: 'Sent once a shift has ended and the session is still open.',
  },
  {
    name: 'autoClockOutNotice',
    label: 'Auto clock-out notice',
    hint: 'Tells the employee their day was closed automatically.',
  },
  {
    name: 'requestDecision',
    label: 'Request and leave decisions',
    hint: 'Tells the employee what was approved or rejected.',
  },
  {
    name: 'approverPending',
    label: 'New approvals waiting',
    hint: 'Tells the Owner and CEO that something needs a decision.',
  },
  {
    name: 'leadershipDailySummary',
    label: 'Morning summary',
    hint: "Yesterday's attendance, lates, absences and missing EODs, for leadership.",
  },
  {
    name: 'probationEndingAlert',
    label: 'Probation ending',
    hint: 'Tells the Owner a week before someone finishes probation.',
  },
];

export default function NotificationSettings({ values, emailConfigured }) {
  const router = useRouter();
  const [form, setForm] = useState(() => ({
    ...Object.fromEntries(TOGGLES.map((t) => [t.name, values[t.name] !== false])),
    email: Boolean(values.email),
  }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await apiPatch('/api/workspace/settings/notifications', form);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save}>
      {saved && (
        <div className="alert alert-success ws-alert" role="status">
          Notification settings saved.
        </div>
      )}
      {error && (
        <div className="alert alert-danger ws-alert" role="alert">
          {error}
        </div>
      )}

      {TOGGLES.map((toggle) => (
        <div className="form-check mb-3" key={toggle.name}>
          <input
            id={'n-' + toggle.name}
            type="checkbox"
            className="form-check-input"
            checked={form[toggle.name]}
            onChange={(e) => set(toggle.name, e.target.checked)}
          />
          <label className="form-check-label" htmlFor={'n-' + toggle.name}>
            <strong>{toggle.label}</strong>
            <span className="d-block ws-muted" style={{ fontSize: '0.85rem' }}>
              {toggle.hint}
            </span>
          </label>
        </div>
      ))}

      <div className="ws-divider" />

      <div className="form-check mb-3">
        <input
          id="n-email"
          type="checkbox"
          className="form-check-input"
          checked={form.email}
          disabled={!emailConfigured}
          onChange={(e) => set('email', e.target.checked)}
        />
        <label className="form-check-label" htmlFor="n-email">
          <strong>Also send by email</strong>
          <span className="d-block ws-muted" style={{ fontSize: '0.85rem' }}>
            {emailConfigured
              ? 'Uses the same Resend key the public site sends with.'
              : 'Set RESEND_API_KEY to enable email. Until then everything still appears under the bell.'}
          </span>
        </label>
      </div>

      <button type="submit" className="btn ws-btn-primary" disabled={saving}>
        {saving ? 'Saving…' : 'Save notifications'}
      </button>
    </form>
  );
}
