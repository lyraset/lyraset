'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPatch, issuesByField } from './api';

/**
 * Per-office settings: the timezone every calculation for that office runs in,
 * the weekend, and the integrity checks applied at clock-in.
 *
 * Policy lives per office because Pakistan and the UAE differ on weekends,
 * working-hour limits and entitlements. The note at the bottom says so rather
 * than implying the portal knows either country's law.
 */

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

export default function OfficeSettings({ offices }) {
  return (
    <>
      {offices.map((office) => (
        <OfficeCard key={office.code} office={office} />
      ))}
    </>
  );
}

function OfficeCard({ office }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: office.name ?? office.code,
    timezone: office.timezone ?? 'Asia/Karachi',
    weekendDays: office.weekendDays ?? [7],
    enforceIpAllowlist: Boolean(office.enforceIpAllowlist),
    ipAllowlist: (office.ipAllowlist ?? []).join('\n'),
    enforceGeofence: Boolean(office.enforceGeofence),
    lat: office.geofence?.lat ?? '',
    lng: office.geofence?.lng ?? '',
    radiusM: office.geofence?.radiusM ?? 200,
    selfieRequired: Boolean(office.selfieRequired),
    policyNote: office.policyNote ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const toggleWeekend = (day) =>
    setForm((f) => ({
      ...f,
      weekendDays: f.weekendDays.includes(day)
        ? f.weekendDays.filter((d) => d !== day)
        : [...f.weekendDays, day].sort(),
    }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    setFieldErrors({});
    try {
      await apiPatch('/api/workspace/settings/offices', {
        code: office.code,
        name: form.name,
        timezone: form.timezone,
        weekendDays: form.weekendDays,
        enforceIpAllowlist: form.enforceIpAllowlist,
        ipAllowlist: form.ipAllowlist
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        enforceGeofence: form.enforceGeofence,
        geofence: {
          lat: form.lat === '' ? null : Number(form.lat),
          lng: form.lng === '' ? null : Number(form.lng),
          radiusM: Number(form.radiusM) || 200,
        },
        selfieRequired: form.selfieRequired,
        policyNote: form.policyNote || null,
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err.message);
      setFieldErrors(issuesByField(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="ws-panel">
      <h2 className="ws-panel-title">{office.name ?? office.code}</h2>

      <form onSubmit={save}>
        {saved && (
          <div className="alert alert-success ws-alert" role="status">
            {office.name} saved.
          </div>
        )}
        {error && (
          <div className="alert alert-danger ws-alert" role="alert">
            {error}
          </div>
        )}

        <div className="row g-3">
          <div className="col-12 col-md-4">
            <label className="form-label ws-label" htmlFor={office.code + '-name'}>
              Display name
            </label>
            <input
              id={office.code + '-name'}
              className="form-control"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          <div className="col-12 col-md-4">
            <label className="form-label ws-label" htmlFor={office.code + '-tz'}>
              Timezone
            </label>
            <select
              id={office.code + '-tz'}
              className="form-select"
              value={form.timezone}
              onChange={(e) => set('timezone', e.target.value)}
            >
              <option value="Asia/Karachi">Asia/Karachi (Pakistan)</option>
              <option value="Asia/Dubai">Asia/Dubai (UAE)</option>
            </select>
            <p className="form-text">
              Every work date, lateness check and cycle for this office is measured here.
            </p>
          </div>

          <div className="col-12 col-md-4">
            <span className="form-label ws-label d-block">Weekend</span>
            <div className="d-flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <div className="form-check" key={day.value}>
                  <input
                    id={office.code + '-wd-' + day.value}
                    type="checkbox"
                    className="form-check-input"
                    checked={form.weekendDays.includes(day.value)}
                    onChange={() => toggleWeekend(day.value)}
                  />
                  <label className="form-check-label" htmlFor={office.code + '-wd-' + day.value}>
                    {day.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="ws-divider" />

        <h3 className="ws-panel-title" style={{ fontSize: '0.95rem' }}>
          Clock-in checks
        </h3>
        <p className="ws-muted" style={{ fontSize: '0.875rem' }}>
          Remote staff are exempt from these, though their IP and location are still recorded.
          Someone based at the office who clocks in outside the geofence must give a reason, and the
          day goes to approvals as official duty rather than being refused.
        </p>

        <div className="row g-3">
          <div className="col-12 col-md-6">
            <div className="form-check mb-2">
              <input
                id={office.code + '-ip-on'}
                type="checkbox"
                className="form-check-input"
                checked={form.enforceIpAllowlist}
                onChange={(e) => set('enforceIpAllowlist', e.target.checked)}
              />
              <label className="form-check-label" htmlFor={office.code + '-ip-on'}>
                Check the office network
              </label>
            </div>
            <label className="form-label ws-label" htmlFor={office.code + '-ip'}>
              Allowed IPs or CIDR ranges, one per line
            </label>
            <textarea
              id={office.code + '-ip'}
              className="form-control"
              rows={3}
              value={form.ipAllowlist}
              placeholder={'203.0.113.10\n203.0.113.0/24'}
              onChange={(e) => set('ipAllowlist', e.target.value)}
            />
            {fieldErrors.ipAllowlist && <p className="ws-field-error">{fieldErrors.ipAllowlist}</p>}
          </div>

          <div className="col-12 col-md-6">
            <div className="form-check mb-2">
              <input
                id={office.code + '-geo-on'}
                type="checkbox"
                className="form-check-input"
                checked={form.enforceGeofence}
                onChange={(e) => set('enforceGeofence', e.target.checked)}
              />
              <label className="form-check-label" htmlFor={office.code + '-geo-on'}>
                Check the location
              </label>
            </div>
            <div className="row g-2">
              <div className="col-4">
                <label className="form-label ws-label" htmlFor={office.code + '-lat'}>
                  Latitude
                </label>
                <input
                  id={office.code + '-lat'}
                  className="form-control"
                  value={form.lat}
                  onChange={(e) => set('lat', e.target.value)}
                />
              </div>
              <div className="col-4">
                <label className="form-label ws-label" htmlFor={office.code + '-lng'}>
                  Longitude
                </label>
                <input
                  id={office.code + '-lng'}
                  className="form-control"
                  value={form.lng}
                  onChange={(e) => set('lng', e.target.value)}
                />
              </div>
              <div className="col-4">
                <label className="form-label ws-label" htmlFor={office.code + '-radius'}>
                  Radius (m)
                </label>
                <input
                  id={office.code + '-radius'}
                  type="number"
                  min="20"
                  max="20000"
                  className="form-control"
                  value={form.radiusM}
                  onChange={(e) => set('radiusM', e.target.value)}
                />
              </div>
            </div>
            <p className="form-text">
              The phone&apos;s own accuracy estimate is added to the radius, so a vague GPS fix does
              not reject someone standing in the office.
            </p>
          </div>

          <div className="col-12">
            <div className="form-check">
              <input
                id={office.code + '-selfie'}
                type="checkbox"
                className="form-check-input"
                checked={form.selfieRequired}
                onChange={(e) => set('selfieRequired', e.target.checked)}
              />
              <label className="form-check-label" htmlFor={office.code + '-selfie'}>
                Require a photo at clock-in
                <span className="d-block ws-muted" style={{ fontSize: '0.85rem' }}>
                  Stored privately and opened only by the Owner. Employees are told about this on
                  first login.
                </span>
              </label>
            </div>
          </div>

          <div className="col-12">
            <label className="form-label ws-label" htmlFor={office.code + '-note'}>
              Policy note
            </label>
            <textarea
              id={office.code + '-note'}
              className="form-control"
              rows={2}
              maxLength={2000}
              value={form.policyNote}
              onChange={(e) => set('policyNote', e.target.value)}
            />
            <p className="form-text">Shown to employees at this office on their profile.</p>
          </div>
        </div>

        <button type="submit" className="btn ws-btn-primary mt-3" disabled={saving}>
          {saving ? 'Saving…' : 'Save ' + (form.name || office.code)}
        </button>
      </form>
    </section>
  );
}
