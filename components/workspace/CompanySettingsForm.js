'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPatch, issuesByField } from './api';
import { formatDate } from './ui';

/**
 * Company-wide rules.
 *
 * Changing the company month start day is the one setting with a delayed
 * effect: it applies from the next cycle, never retroactively, so the page
 * says which date it takes effect on rather than leaving the Owner to wonder
 * whether last month just moved.
 */
export default function CompanySettingsForm({ settings, currentCycle, nextCycle, cycleStartDay }) {
  const router = useRouter();
  const [form, setForm] = useState({
    cycleStartDay: String(cycleStartDay),
    monthlyLeaveQuota: String(settings.monthlyLeaveQuota ?? 2),
    leaveCarryForward: settings.leaveCarryForward ?? 'LAPSE',
    maxCarryForward: String(settings.maxCarryForward ?? 0),
    overQuotaBehavior: settings.overQuotaBehavior ?? 'CONVERT_TO_UNPAID',
    sandwichRule: Boolean(settings.sandwichRule),
    halfDayThresholdPercent: String(settings.halfDayThresholdPercent ?? 50),
    autoClockOutOffsetHours: String(settings.autoClockOutOffsetHours ?? 4),
    paidBreaks: Boolean(settings.paidBreaks),
    lateCount: String(settings.lateToDeduction?.lateCount ?? 3),
    deductionDays: String(settings.lateToDeduction?.deductionDays ?? 0.5),
    eodEditWindowHours: String(settings.eodEditWindowHours ?? 12),
    eodMinDescriptionLength: String(settings.eodMinDescriptionLength ?? 20),
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const startDayChanged = Number(form.cycleStartDay) !== Number(cycleStartDay);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    setFieldErrors({});
    try {
      const result = await apiPatch('/api/workspace/settings/company', {
        cycleStartDay: Number(form.cycleStartDay),
        monthlyLeaveQuota: Number(form.monthlyLeaveQuota),
        leaveCarryForward: form.leaveCarryForward,
        maxCarryForward: Number(form.maxCarryForward),
        overQuotaBehavior: form.overQuotaBehavior,
        sandwichRule: form.sandwichRule,
        halfDayThresholdPercent: Number(form.halfDayThresholdPercent),
        autoClockOutOffsetHours: Number(form.autoClockOutOffsetHours),
        paidBreaks: form.paidBreaks,
        lateToDeduction: {
          lateCount: Number(form.lateCount),
          deductionDays: Number(form.deductionDays),
        },
        eodEditWindowHours: Number(form.eodEditWindowHours),
        eodMinDescriptionLength: Number(form.eodMinDescriptionLength),
      });
      setNotice(
        result.cycleChangeEffectiveFrom
          ? 'Saved. The new company month start day takes effect from ' +
              formatDate(result.cycleChangeEffectiveFrom) +
              '. Cycles before then keep their original dates.'
          : 'Settings saved.'
      );
      router.refresh();
    } catch (err) {
      setError(err.message);
      setFieldErrors(issuesByField(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save}>
      {notice && (
        <div className="alert alert-success ws-alert" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="alert alert-danger ws-alert" role="alert">
          {error}
        </div>
      )}

      <section className="ws-panel">
        <h2 className="ws-panel-title">Company month</h2>
        <p className="ws-muted">
          The current cycle runs {currentCycle.startDate} to {currentCycle.endDate}. A start day of
          26 means the September cycle is 26 August to 25 September.
        </p>
        <div className="row g-3">
          <Num
            col="col-12 col-md-4"
            label="Start day of the month"
            name="cycleStartDay"
            min="1"
            max="28"
            value={form.cycleStartDay}
            set={set}
            errors={fieldErrors}
          />
        </div>
        {startDayChanged && (
          <div className="alert alert-warning ws-alert mt-3 mb-0" role="status">
            This takes effect from the next cycle, starting {nextCycle.startDate}. Cycles already
            reported and paid keep their original dates.
          </div>
        )}
      </section>

      <section className="ws-panel">
        <h2 className="ws-panel-title">Leave</h2>
        <div className="row g-3">
          <Num
            col="col-12 col-md-3"
            label="Paid leaves per cycle"
            name="monthlyLeaveQuota"
            min="0"
            max="31"
            step="0.5"
            value={form.monthlyLeaveQuota}
            set={set}
            errors={fieldErrors}
          />
          <Pick
            col="col-12 col-md-3"
            label="Unused days"
            name="leaveCarryForward"
            value={form.leaveCarryForward}
            set={set}
            options={[
              { value: 'LAPSE', label: 'Lapse at the end of the cycle' },
              { value: 'CARRY', label: 'Carry forward' },
            ]}
          />
          <Num
            col="col-12 col-md-3"
            label="Maximum carried forward"
            name="maxCarryForward"
            min="0"
            max="31"
            step="0.5"
            value={form.maxCarryForward}
            set={set}
            errors={fieldErrors}
          />
          <Pick
            col="col-12 col-md-3"
            label="Over the quota"
            name="overQuotaBehavior"
            value={form.overQuotaBehavior}
            set={set}
            options={[
              { value: 'CONVERT_TO_UNPAID', label: 'Convert the excess to unpaid' },
              { value: 'BLOCK', label: 'Block the request' },
            ]}
          />
          <Check
            col="col-12"
            label="Sandwich rule: weekends and holidays between leave days count as leave"
            name="sandwichRule"
            value={form.sandwichRule}
            set={set}
          />
        </div>
      </section>

      <section className="ws-panel">
        <h2 className="ws-panel-title">Attendance</h2>
        <div className="row g-3">
          <Num
            col="col-12 col-md-3"
            label="Half-day threshold (%)"
            name="halfDayThresholdPercent"
            min="1"
            max="100"
            value={form.halfDayThresholdPercent}
            set={set}
            errors={fieldErrors}
            hint="A day under this share of its required minutes is a half day."
          />
          <Num
            col="col-12 col-md-3"
            label="Lates per deduction"
            name="lateCount"
            min="0"
            max="31"
            value={form.lateCount}
            set={set}
            errors={fieldErrors}
          />
          <Num
            col="col-12 col-md-3"
            label="Deduction (days)"
            name="deductionDays"
            min="0"
            max="5"
            step="0.5"
            value={form.deductionDays}
            set={set}
            errors={fieldErrors}
            hint="e.g. 3 lates costs half a day."
          />
          <Num
            col="col-12 col-md-3"
            label="Auto clock-out (hours after shift end)"
            name="autoClockOutOffsetHours"
            min="1"
            max="24"
            value={form.autoClockOutOffsetHours}
            set={set}
            errors={fieldErrors}
          />
          <Check
            col="col-12"
            label="Breaks are paid (break time counts as worked, and the required minutes grow to match)"
            name="paidBreaks"
            value={form.paidBreaks}
            set={set}
          />
        </div>
      </section>

      <section className="ws-panel">
        <h2 className="ws-panel-title">End-of-day reports</h2>
        <div className="row g-3">
          <Num
            col="col-12 col-md-4"
            label="Edit window (hours)"
            name="eodEditWindowHours"
            min="0"
            max="168"
            value={form.eodEditWindowHours}
            set={set}
            errors={fieldErrors}
            hint="0 means reports cannot be edited once submitted."
          />
          <Num
            col="col-12 col-md-4"
            label="Minimum description length"
            name="eodMinDescriptionLength"
            min="0"
            max="2000"
            value={form.eodMinDescriptionLength}
            set={set}
            errors={fieldErrors}
            hint="Characters required per task."
          />
        </div>
      </section>

      <button type="submit" className="btn ws-btn-primary" disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  );
}

function Num({ col, label, name, value, set, errors, min, max, step, hint }) {
  return (
    <div className={col}>
      <label className="form-label ws-label" htmlFor={'s-' + name}>
        {label}
      </label>
      <input
        id={'s-' + name}
        type="number"
        className="form-control"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => set(name, e.target.value)}
      />
      {hint && <p className="form-text">{hint}</p>}
      {errors?.[name] && <p className="ws-field-error">{errors[name]}</p>}
    </div>
  );
}

function Pick({ col, label, name, value, set, options }) {
  return (
    <div className={col}>
      <label className="form-label ws-label" htmlFor={'s-' + name}>
        {label}
      </label>
      <select
        id={'s-' + name}
        className="form-select"
        value={value}
        onChange={(e) => set(name, e.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Check({ col, label, name, value, set }) {
  return (
    <div className={col}>
      <div className="form-check">
        <input
          id={'s-' + name}
          type="checkbox"
          className="form-check-input"
          checked={value}
          onChange={(e) => set(name, e.target.checked)}
        />
        <label className="form-check-label" htmlFor={'s-' + name}>
          {label}
        </label>
      </div>
    </div>
  );
}
