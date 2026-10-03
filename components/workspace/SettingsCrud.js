'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPost, apiPatch, apiDelete, issuesByField } from './api';
import { Empty, TableWrap } from './ui';

/**
 * The shared editor for the simple settings lists — departments, projects,
 * leave types and holidays.
 *
 * Each page declares its fields; this handles add, edit and retire. Retiring
 * sets `active: false` rather than deleting, so an EOD that referenced a
 * project two years ago still says what it said.
 */
export default function SettingsCrud({
  endpoint,
  collectionKey,
  items,
  fields,
  columns,
  addLabel = 'Add',
  emptyTitle = 'Nothing here yet',
  emptyBody = 'Add the first one below.',
  retireLabel = 'Retire',
  hardDelete = false,
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => defaults(fields));
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const current = editing ?? draft;
  const setValue = (name, value) =>
    editing
      ? setEditing((e) => ({ ...e, [name]: value }))
      : setDraft((d) => ({ ...d, [name]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      const body = serialize(fields, current);
      if (editing) await apiPatch(endpoint, { id: editing.id, ...body });
      else await apiPost(endpoint, body);
      setDraft(defaults(fields));
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(err.message);
      setFieldErrors(issuesByField(err));
    } finally {
      setBusy(false);
    }
  };

  const retire = async (id) => {
    setBusy(true);
    setError('');
    try {
      await apiDelete(endpoint + '?id=' + id);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && (
        <div className="alert alert-danger ws-alert" role="alert">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <Empty title={emptyTitle}>{emptyBody}</Empty>
      ) : (
        <TableWrap label={collectionKey}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th scope="col" key={column.key}>
                  {column.label}
                </th>
              ))}
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={item.active === false ? { opacity: 0.55 } : undefined}>
                {columns.map((column) => (
                  <td key={column.key} className={column.wrap ? 'ws-wrap' : undefined}>
                    {column.swatch && (
                      <span
                        className="ws-cal-dot me-2"
                        style={{ background: item[column.swatch] }}
                        aria-hidden="true"
                      />
                    )}
                    {cellText(item, column)}
                  </td>
                ))}
                <td>
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn ws-btn-ghost ws-btn-sm"
                      onClick={() => setEditing(toForm(fields, item))}
                    >
                      Edit
                    </button>
                    {(hardDelete || item.active !== false) && (
                      <button
                        type="button"
                        className="btn ws-btn-danger ws-btn-sm"
                        onClick={() => retire(item.id)}
                        disabled={busy}
                      >
                        {hardDelete ? 'Delete' : retireLabel}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <form onSubmit={submit} className="mt-3">
        <h3 className="ws-panel-title">{editing ? 'Edit' : addLabel}</h3>
        <div className="row g-3">
          {fields.map((field) => (
            <FieldInput
              key={field.name}
              field={field}
              value={current[field.name]}
              onChange={setValue}
              error={fieldErrors[field.name]}
            />
          ))}
        </div>

        <div className="d-flex gap-2 mt-3">
          <button type="submit" className="btn ws-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : addLabel}
          </button>
          {editing && (
            <button type="button" className="btn ws-btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </>
  );
}

function FieldInput({ field, value, onChange, error }) {
  const id = 'crud-' + field.name;
  const col = field.col ?? 'col-12 col-md-4';

  if (field.type === 'checkbox') {
    return (
      <div className={col}>
        <div className="form-check mt-4">
          <input
            id={id}
            type="checkbox"
            className="form-check-input"
            checked={Boolean(value)}
            onChange={(e) => onChange(field.name, e.target.checked)}
          />
          <label className="form-check-label" htmlFor={id}>
            {field.label}
          </label>
        </div>
        {field.hint && <p className="form-text">{field.hint}</p>}
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div className={col}>
        <label className="form-label ws-label" htmlFor={id}>
          {field.label}
        </label>
        <select
          id={id}
          className="form-select"
          value={value ?? ''}
          onChange={(e) => onChange(field.name, e.target.value)}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {field.hint && <p className="form-text">{field.hint}</p>}
        {error && <p className="ws-field-error">{error}</p>}
      </div>
    );
  }

  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className={col}>
        <span className="form-label ws-label d-block">{field.label}</span>
        {field.options.map((option) => (
          <div className="form-check" key={option.value}>
            <input
              id={id + '-' + option.value}
              type="checkbox"
              className="form-check-input"
              checked={selected.includes(option.value)}
              onChange={(e) =>
                onChange(
                  field.name,
                  e.target.checked
                    ? [...selected, option.value]
                    : selected.filter((v) => v !== option.value)
                )
              }
            />
            <label className="form-check-label" htmlFor={id + '-' + option.value}>
              {option.label}
            </label>
          </div>
        ))}
        {field.hint && <p className="form-text">{field.hint}</p>}
      </div>
    );
  }

  return (
    <div className={col}>
      <label
        className={'form-label ws-label' + (field.required ? ' ws-required' : '')}
        htmlFor={id}
      >
        {field.label}
      </label>
      <input
        id={id}
        className="form-control"
        type={field.type ?? 'text'}
        value={value ?? ''}
        min={field.min}
        max={field.max}
        step={field.step}
        placeholder={field.placeholder}
        onChange={(e) => onChange(field.name, e.target.value)}
      />
      {field.hint && <p className="form-text">{field.hint}</p>}
      {error && <p className="ws-field-error">{error}</p>}
    </div>
  );
}

/**
 * What a cell shows. The pages are server components, and a function cannot
 * be handed to this client component, so a page that wants a friendlier label
 * than the raw value puts the text in `item.display[key]` instead.
 */
function cellText(item, column) {
  const value = item.display?.[column.key] ?? item[column.key];
  return value === '' || value == null ? '—' : String(value);
}

function defaults(fields) {
  const out = {};
  for (const field of fields) {
    out[field.name] =
      field.default ?? (field.type === 'checkbox' ? false : field.type === 'multiselect' ? [] : '');
  }
  return out;
}

function toForm(fields, item) {
  const out = { id: item.id };
  for (const field of fields) {
    const value = item[field.name];
    out[field.name] =
      field.type === 'checkbox'
        ? Boolean(value)
        : field.type === 'multiselect'
          ? (value ?? [])
          : (value ?? '');
  }
  return out;
}

/** Numbers arrive from inputs as strings; empty optional fields become null. */
function serialize(fields, form) {
  const out = {};
  for (const field of fields) {
    const value = form[field.name];
    if (field.type === 'checkbox') out[field.name] = Boolean(value);
    else if (field.type === 'multiselect') out[field.name] = value ?? [];
    else if (field.type === 'number')
      out[field.name] = value === '' ? (field.nullable ? null : 0) : Number(value);
    else out[field.name] = value === '' ? (field.nullable ? null : '') : value;
  }
  return out;
}
