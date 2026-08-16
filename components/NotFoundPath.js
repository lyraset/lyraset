'use client';

import { useEffect, useState } from 'react';

/**
 * Echoes the URL that missed, so a visitor who mistyped or followed a stale
 * link can see which address failed.
 *
 * Reads the path after mount rather than during render: the server has no
 * request path when prerendering the 404, so rendering it immediately would
 * produce a server/client mismatch. Nothing is shown for "/", which can't be a
 * real 404.
 */
export default function NotFoundPath() {
  const [path, setPath] = useState('');

  useEffect(() => {
    const current = window.location.pathname;
    if (current && current !== '/') setPath(current);
  }, []);

  if (!path) return null;
  return <code className="nf__path">{path}</code>;
}
