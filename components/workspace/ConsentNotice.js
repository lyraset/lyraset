'use client';

import { useState } from 'react';
import { apiPost } from './api';

/**
 * Shown on first login, before anyone clocks in for the first time.
 *
 * The point is that nobody is monitored without being told what is collected,
 * so this states it plainly and records the acknowledgment with a timestamp.
 * It is not a blocking modal: it sits at the top of the dashboard until it is
 * acknowledged.
 */
export default function ConsentNotice({ office }) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (done) return null;

  const acknowledge = async () => {
    setBusy(true);
    setError('');
    try {
      await apiPost('/api/workspace/consent', { acknowledged: true });
      setDone(true);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const collected = [
    'the time you clock in and out, stamped by our server',
    'your IP address at each clock event',
    office?.geofenceEnforced
      ? 'your location at clock-in, if you allow it, to confirm you are at the office'
      : 'your location at clock-in, if you allow it',
  ].filter(Boolean);

  return (
    <section className="ws-panel" aria-labelledby="ws-consent-title">
      <h2 className="ws-panel-title" id="ws-consent-title">
        Before you start: what this portal records
      </h2>
      <p className="ws-muted">
        So that attendance is accurate and can be checked, the portal keeps:
      </p>
      <ul className="ws-muted">
        {collected.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="ws-muted">
        HR documents are stored privately and are only opened by the Owner. Nothing here is shared
        outside LYRASET.
      </p>

      {error && (
        <div className="alert alert-danger ws-alert" role="alert">
          {error}
        </div>
      )}

      <button type="button" className="btn ws-btn-primary" onClick={acknowledge} disabled={busy}>
        {busy ? 'Saving…' : 'I understand'}
      </button>
    </section>
  );
}
