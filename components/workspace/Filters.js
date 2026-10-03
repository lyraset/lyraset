'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Filter controls that live in the URL rather than in component state.
 *
 * Keeping them in the query string means a filtered view can be bookmarked,
 * shared with a colleague, and survives a refresh — which matters for a team
 * sheet someone is looking at while talking to the person it is about.
 */
export default function Filters({ fields }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (name, value) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(name, value);
      else params.delete(name);
      // Not params.size: Safari before iOS 17 does not have it, so filters
      // would silently never apply there.
      const search = params.toString();
      router.push(pathname + (search ? '?' + search : ''));
    },
    [router, pathname, searchParams]
  );

  const hasAny = fields.some((field) => searchParams.get(field.name));

  return (
    <div className="ws-filters">
      {fields.map((field) => (
        <div className="ws-filter" key={field.name}>
          <label htmlFor={'filter-' + field.name}>{field.label}</label>
          {field.type === 'select' ? (
            <select
              id={'filter-' + field.name}
              className="form-select"
              value={searchParams.get(field.name) ?? ''}
              onChange={(e) => setParam(field.name, e.target.value)}
            >
              <option value="">{field.placeholder ?? 'All'}</option>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={'filter-' + field.name}
              type={field.type ?? 'text'}
              className="form-control"
              value={searchParams.get(field.name) ?? ''}
              placeholder={field.placeholder}
              onChange={(e) => setParam(field.name, e.target.value)}
            />
          )}
        </div>
      ))}

      {hasAny && (
        <div className="ws-filter" style={{ minWidth: 0 }}>
          <label aria-hidden="true">&nbsp;</label>
          <button type="button" className="btn ws-btn-ghost" onClick={() => router.push(pathname)}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
