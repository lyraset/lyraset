'use client';

import { useState } from 'react';
import ThemeToggle from '@/components/workspace/ThemeToggle';
import BrandMark from '@/components/workspace/BrandMark';

export default function LoginForm({ next = '', notice = '' }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!identifier.trim() || !password) {
      setError('Enter your Employee ID or email and your password.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/workspace/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password, next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Sign-in failed. Try again.');
        setLoading(false);
        return;
      }
      window.location.assign(data.redirectTo || '/workspace');
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
      setLoading(false);
    }
  }

  return (
    <main className="ws-login">
      <section className="ws-login-panel" aria-labelledby="ws-login-title">
        <div className="ws-login-head">
          <BrandMark size={32} priority />
          <ThemeToggle />
        </div>
        <h1 id="ws-login-title" className="ws-login-title">
          Sign in to clock in
        </h1>
        <p className="ws-login-lead">
          Use the Employee ID or email and the password the Owner gave you.
        </p>

        {notice && <div className="alert alert-info ws-alert">{notice}</div>}
        {error && (
          <div className="alert alert-danger ws-alert" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-3">
            <label htmlFor="identifier" className="form-label ws-label">
              Employee ID or email
            </label>
            <input
              id="identifier"
              className="form-control ws-input"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="LYR-0012 or name@lyraset.com"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="password" className="form-label ws-label">
              Password
            </label>
            <div className="input-group">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="form-control ws-input"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="btn ws-btn-ghost"
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <button type="submit" className="btn ws-btn-primary w-100" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="ws-login-help">Forgot your password? The Owner can reset it for you.</p>
      </section>
    </main>
  );
}
