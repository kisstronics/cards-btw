import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { googleLoginUrl } from '../api';
import { useAuth } from '../auth';
import { useTheme } from '../theme';

export function LoginPage() {
  const { user, loading, googleEnabled, allowDevLogin, loginDev } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [params] = useSearchParams();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const fromQuery = params.get('error');
    if (!fromQuery) return;
    const nice: Record<string, string> = {
      google_not_configured: 'Google login is not configured on the server.',
      google_auth_failed: 'Google sign-in failed. Check OAuth redirect URI settings.',
      google_login_failed: 'Could not complete Google sign-in.',
      google_no_profile: 'Google did not return a user profile.',
      access_denied: 'Google sign-in was cancelled.',
    };
    setError(nice[fromQuery] || fromQuery);
  }, [params]);

  // Auto-login: never flash the login form while restoring a stored session.
  if (user) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return (
      <div className="mobile-shell">
        <div className="app-main center">
          <p>Signing you in…</p>
        </div>
      </div>
    );
  }

  async function onDevLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await loginDev(name || 'Player');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not sign in. Is the server running?',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mobile-shell login-page">
      <button
        type="button"
        className="icon-btn theme-toggle login-theme-toggle"
        onClick={toggleTheme}
        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        title={theme === 'light' ? 'Dark mode' : 'Light mode'}
      >
        {theme === 'light' ? '☾' : '☀'}
      </button>
      <div className="login-panel app-main">
        <p className="brand">Between</p>
        <h1>Card table nights, online</h1>
        <p className="lede">
          Create a room, invite friends, and play Between until the host ends
          the night.
        </p>
        <p className="muted">
          Inspired by Narayan Blue Man, Pawan Sir, Venkatesh Sir, and Sai Sir.
        </p>

        {googleEnabled && (
          <a className="btn primary" href={googleLoginUrl()}>
            Continue with Google
          </a>
        )}

        {allowDevLogin && (
          <form className="dev-form" onSubmit={onDevLogin}>
            {!googleEnabled && (
              <p className="hint">
                Google OAuth is not configured yet — use a quick name to play.
              </p>
            )}
            {googleEnabled && <p className="divider">or play as guest</p>}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your display name"
              maxLength={40}
              autoFocus
            />
            <button className="btn secondary" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Enter lobby'}
            </button>
          </form>
        )}

        {error && <p className="error">{error}</p>}
      </div>

      <footer className="site-footer gate-footer">
        <nav className="footer-links" aria-label="Site">
          <Link className="footer-link" to="/about">
            Who we are
          </Link>
          <Link className="footer-link" to="/privacy">
            Privacy
          </Link>
          <Link className="footer-link" to="/contact">
            Contact us
          </Link>
        </nav>
        <p className="footer-copy">Knics@2026</p>
      </footer>
    </div>
  );
}
