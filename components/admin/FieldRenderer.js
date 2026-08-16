'use client';

import MediaPicker from '@/components/admin/MediaPicker';
import Icon from '@/components/Icon';
import { slugify } from '@/lib/utils';

/**
 * Renders a single form control from a field descriptor. Supports text,
 * textarea/richtext, number, boolean (switch), select, slug, media, and the
 * repeatable list types (stringList, objectList, socials). objectList recurses
 * into this same component for its sub-fields — this is what lets the CMS edit
 * arbitrarily nested content (deliverables, metrics, offices, stats, columns…).
 */
export default function FieldRenderer({ field, value, onChange }) {
  const { type, label, hint, name } = field;
  // Fields the schema marks read-only (e.g. a slug pinned to a code route).
  const disabled = Boolean(field.disabled);

  const control = () => {
    switch (type) {
      case 'textarea':
      case 'richtext':
        return (
          <textarea
            className="admin-textarea"
            rows={type === 'richtext' ? 6 : 3}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
          />
        );

      case 'number':
        return (
          <input
            className="admin-input"
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          />
        );

      case 'boolean':
        return (
          <label className="admin-switch">
            <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
            {value ? 'On' : 'Off'}
          </label>
        );

      case 'select':
        return (
          <select
            className="admin-select"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          >
            <option value="">— Select —</option>
            {(field.options || []).map((o) => (
              <option key={o.value ?? o} value={o.value ?? o}>
                {o.label ?? o}
              </option>
            ))}
          </select>
        );

      case 'media':
        return <MediaPicker value={value || {}} onChange={onChange} resourceType={field.resourceType || 'image'} />;

      case 'mediaList':
        return <MediaList value={value || []} onChange={onChange} resourceType={field.resourceType || 'image'} />;

      case 'object':
        return (
          <div className="section-editor__item" style={{ padding: '1rem' }}>
            {field.fields.map((f) => (
              <FieldRenderer
                key={f.name}
                field={f}
                value={(value || {})[f.name]}
                onChange={(v) => onChange({ ...(value || {}), [f.name]: v })}
              />
            ))}
          </div>
        );

      case 'stringList':
        return <StringList value={value || []} onChange={onChange} placeholder={field.placeholder} />;

      case 'objectList':
        return <ObjectList value={value || []} onChange={onChange} fields={field.fields} itemLabel={field.itemLabel} />;

      case 'socials':
        return <SocialsList value={value || []} onChange={onChange} />;

      case 'slug':
        return (
          <input
            className="admin-input"
            value={value ?? ''}
            onChange={(e) => onChange(slugify(e.target.value))}
            placeholder="auto-generated-from-title"
          />
        );

      case 'text':
      default:
        return (
          <input
            className="admin-input"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
          />
        );
    }
  };

  return (
    <div className="admin-field" style={field.full ? { gridColumn: '1 / -1' } : undefined}>
      {label && (
        <label>
          {label} {field.required && <span style={{ color: 'var(--blue-500)' }}>*</span>}
        </label>
      )}
      {control()}
      {hint && <div className="admin-field__hint">{hint}</div>}
    </div>
  );
}

// ---- Repeatable string list ----------------------------------------------
function StringList({ value, onChange, placeholder }) {
  const set = (i, v) => onChange(value.map((x, j) => (j === i ? v : x)));
  const add = () => onChange([...value, '']);
  const remove = (i) => onChange(value.filter((_, j) => j !== i));
  return (
    <div>
      {value.map((item, i) => (
        <div className="admin-repeat__row" key={i}>
          <input className="admin-input" value={item} onChange={(e) => set(i, e.target.value)} placeholder={placeholder} />
          <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => remove(i)} aria-label="Remove">
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={add}>
        <Icon name="arrow-down" size={14} /> Add item
      </button>
    </div>
  );
}

// ---- Repeatable object list ----------------------------------------------
function ObjectList({ value, onChange, fields, itemLabel }) {
  const setField = (i, key, v) => onChange(value.map((row, j) => (j === i ? { ...row, [key]: v } : row)));
  const add = () => onChange([...value, {}]);
  const remove = (i) => onChange(value.filter((_, j) => j !== i));
  return (
    <div>
      {value.map((row, i) => (
        <div className="section-editor__item" key={i} style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '0.85rem', color: 'var(--grey-500)' }}>
              {itemLabel ? `${itemLabel} ${i + 1}` : `Item ${i + 1}`}
            </strong>
            <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => remove(i)}>
              <Icon name="close" size={14} /> Remove
            </button>
          </div>
          {fields.map((f) => (
            <FieldRenderer key={f.name} field={f} value={row[f.name]} onChange={(v) => setField(i, f.name, v)} />
          ))}
        </div>
      ))}
      <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={add}>
        <Icon name="arrow-down" size={14} /> Add {itemLabel || 'item'}
      </button>
    </div>
  );
}

// ---- Media list (gallery) -------------------------------------------------
function MediaList({ value, onChange, resourceType }) {
  const set = (i, v) => onChange(value.map((x, j) => (j === i ? v : x)));
  const add = () => onChange([...value, {}]);
  const remove = (i) => onChange(value.filter((_, j) => j !== i));
  return (
    <div>
      {value.map((item, i) => (
        <div className="section-editor__item" key={i} style={{ padding: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.35rem' }}>
            <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => remove(i)}>
              <Icon name="close" size={14} /> Remove
            </button>
          </div>
          <MediaPicker value={item} onChange={(v) => set(i, v)} resourceType={resourceType} />
        </div>
      ))}
      <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={add}>
        <Icon name="arrow-down" size={14} /> Add media
      </button>
    </div>
  );
}

// ---- Socials list ---------------------------------------------------------
function SocialsList({ value, onChange }) {
  // Keep in sync with the glyphs in components/Icon.js — a platform with no
  // icon renders as an empty link in the footer and contact panel.
  const platforms = ['instagram', 'facebook', 'x', 'linkedin', 'pinterest', 'youtube', 'tiktok'];
  const set = (i, key, v) => onChange(value.map((row, j) => (j === i ? { ...row, [key]: v } : row)));
  const add = () => onChange([...value, { platform: 'instagram', url: '' }]);
  const remove = (i) => onChange(value.filter((_, j) => j !== i));
  return (
    <div>
      {value.map((row, i) => (
        <div className="admin-repeat__row" key={i}>
          <select className="admin-select" style={{ maxWidth: 140 }} value={row.platform} onChange={(e) => set(i, 'platform', e.target.value)}>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input className="admin-input" value={row.url} onChange={(e) => set(i, 'url', e.target.value)} placeholder="https://…" />
          <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => remove(i)} aria-label="Remove">
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={add}>
        <Icon name="arrow-down" size={14} /> Add social link
      </button>
    </div>
  );
}
