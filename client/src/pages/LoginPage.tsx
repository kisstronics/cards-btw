import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { googleLoginUrl } from '../api';
import { useAuth } from '../auth';

export function LoginPage() {
  const { user, loading, googleEnabled, allowDevLogin, loginDev } = useAuth();
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

  if (!loading && user) {
    return <Navigate to="/" replace />;
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
    </div>
  );
}
