'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiList, apiCreate } from '@/lib/admin/client';
import { useToast } from '@/components/admin/ToastProvider';
import Icon from '@/components/Icon';
import { slugify } from '@/lib/utils';

export default function AdminPages() {
  const router = useRouter();
  const toast = useToast();
  const [pages, setPages] = useState(null);
  const [demo, setDemo] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiList('pages').then((res) => {
      setPages(res.items || []);
      setDemo(!!res.demo);
    });
  }, []);

  async function create(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const res = await apiCreate('pages', {
      title: title.trim(),
      slug: slugify(title),
      published: false,
      sections: [],
      seo: { schemaType: 'WebPage' },
    });
    setBusy(false);
    if (res.ok) {
      toast('Page created — add sections, then publish', 'success');
      router.push(`/admin/pages/${res.item._id}`);
    } else {
      toast(res.error || 'Could not create page', 'error');
    }
  }

  return (
    <div>
      <p style={{ color: 'var(--grey-500)', marginTop: 0 }}>
        Each page is a stack of sections. Edit any field, toggle visibility, reorder by dragging, or
        add new sections — no code required. A new page goes live at its slug and is added to
        sitemap.xml automatically once you publish it.
      </p>
      {demo && (
        <div className="admin-demo-banner">
          Showing bundled seed pages — editing needs a database.
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        {creating ? (
          <form className="admin-panel" onSubmit={create}>
            <div className="admin-panel__title">New page</div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <input
                className="admin-input"
                autoFocus
                placeholder="Page title, e.g. Pricing"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ maxWidth: 320 }}
              />
              <button className="admin-btn admin-btn--primary" type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create'}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
            </div>
            {title.trim() && (
              <p className="admin-field__hint">
                Will be published at <strong>/{slugify(title)}</strong>
              </p>
            )}
          </form>
        ) : (
          <button
            className="admin-btn admin-btn--primary"
            onClick={() => setCreating(true)}
            disabled={demo}
          >
            <Icon name="arrow-down" size={16} /> New page
          </button>
        )}
      </div>

      {pages === null ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <tbody>
              {[0, 1, 2].map((r) => (
                <tr key={r}>
                  <td><div className="skeleton" style={{ height: 16, width: '60%' }} /></td>
                  <td><div className="skeleton" style={{ height: 16, width: '40%' }} /></td>
                  <td><div className="skeleton" style={{ height: 16, width: '30%' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Page</th>
                <th>URL</th>
                <th>Sections</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p._id}>
                  <td><strong>{p.title || p.slug}</strong></td>
                  <td>/{p.slug === 'home' ? '' : p.slug}</td>
                  <td>{p.sections?.length || 0}</td>
                  <td>
                    {p.published === false ? (
                      <span className="chip-tag">Draft</span>
                    ) : p.seo?.noindex ? (
                      <span className="chip-tag">Live · no-index</span>
                    ) : (
                      <span className="chip-tag">Live</span>
                    )}
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <Link
                        href={`/admin/pages/${p._id}`}
                        className="admin-btn admin-btn--ghost admin-btn--sm"
                      >
                        Edit <Icon name="arrow-right" size={14} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
