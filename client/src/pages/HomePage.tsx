import { Link } from 'react-router-dom';
import { useTheme } from '../theme';

const features = [
  {
    id: 'rooms',
    title: 'Create or join a table',
    body: 'Host a room in seconds or enter a code to sit down with friends — no setup beyond signing in.',
  },
  {
    id: 'live',
    title: 'Live multiplayer hands',
    body: 'Between for 2–6 players on a shared board, with the host keeping the night open until they end it.',
  },
  {
    id: 'scores',
    title: 'Scores that swing either way',
    body: 'Everyone starts at zero. Wins and losses stick for the session, including negative scores.',
  },
  {
    id: 'history',
    title: 'Your games in one list',
    body: 'Rejoin tables you’ve created or sat at, and resume when you’re still at an open game.',
  },
];

export function HomePage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="mobile-shell home-shell">
      <button
        type="button"
        className="icon-btn theme-toggle login-theme-toggle"
        onClick={toggleTheme}
        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        title={theme === 'light' ? 'Dark mode' : 'Light mode'}
      >
        {theme === 'light' ? '☾' : '☀'}
      </button>

      <main className="home-page">
        <section className="home-hero">
          <p className="brand">Between</p>
          <h1>Card table nights, online</h1>
          <p className="lede">
            A multiplayer Between table for friends — quick hands, a shared board,
            and scores that keep the night interesting.
          </p>
          <div className="home-actions">
            <Link className="btn primary" to="/login">
              Sign in to play
            </Link>
            <a className="btn secondary" href="#features">
              See features
            </a>
          </div>
        </section>

        <section className="home-features" id="features">
          <p className="eyebrow">Key features</p>
          <h2>What you get at the table</h2>
          <ul className="feature-list">
            {features.map((feature) => (
              <li key={feature.id} className="feature-item">
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="home-close">
          <p className="eyebrow">Ready when you are</p>
          <h2>Sign in and open a room</h2>
          <p className="lede">
            Invite friends with a code and play until the host ends the night.
          </p>
          <Link className="btn primary" to="/login">
            Continue to sign in
          </Link>
        </section>
      </main>

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
