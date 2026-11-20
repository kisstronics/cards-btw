import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { useTheme } from '../theme';

function userInitials(name?: string, email?: string) {
  const trimmed = (name || '').trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || 'U';
  }
  const mail = (email || '').trim();
  if (mail) return mail[0].toUpperCase();
  return 'U';
}

function Avatar({
  user,
  className,
  size = 'sm',
}: {
  user: { name?: string; email?: string; picture?: string } | null;
  className?: string;
  size?: 'sm' | 'lg';
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const picture = user?.picture?.trim();
  const initials = userInitials(user?.name, user?.email);

  if (picture && !imgFailed) {
    return (
      <img
        className={className}
        src={picture}
        alt=""
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span
      className={`user-avatar-fallback ${size === 'lg' ? 'lg' : ''} ${className || ''}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

function SiteFooter({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <footer className="site-footer app-footer">
      <nav className="footer-links" aria-label="Site">
        <Link className="footer-link" to="/about" onClick={onNavigate}>
          Who we are
        </Link>
        <Link className="footer-link" to="/privacy" onClick={onNavigate}>
          Privacy
        </Link>
        <Link className="footer-link" to="/contact" onClick={onNavigate}>
          Contact us
        </Link>
      </nav>
      <p className="footer-copy">Knics@2026</p>
    </footer>
  );
}

export function AppShell({
  children,
  title,
  trailing,
}: {
  children: ReactNode;
  title?: string;
  trailing?: ReactNode;
}) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    setSheetOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('menu-open', menuOpen);
    return () => document.body.classList.remove('menu-open');
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen && !sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setSheetOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen, sheetOpen]);

  function openAccount() {
    setMenuOpen(false);
    setSheetOpen(true);
  }

  function closeAll() {
    setMenuOpen(false);
    setSheetOpen(false);
  }

  function onLogout() {
    closeAll();
    logout();
  }

  return (
    <div className={`mobile-shell app-shell${menuOpen ? ' is-menu-open' : ''}`}>
      <header className="app-header desktop-bar">
        <button
          type="button"
          className="icon-btn"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="menu-toggle-bars" aria-hidden="true" />
        </button>

        <Link to="/" className="app-brand">
          {title || 'Between'}
        </Link>

        <div className="app-header-actions">
          {trailing}
          <button
            type="button"
            className="icon-btn theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}
          >
            {theme === 'light' ? '☾' : '☀'}
          </button>
          <button
            type="button"
            className="icon-btn signout-btn"
            onClick={onLogout}
            aria-label="Sign out"
            title="Sign out"
          >
            Sign out
          </button>
        </div>
      </header>

      <header className={`mobile-bar${trailing ? ' has-trailing' : ''}`}>
        <button
          type="button"
          className="menu-toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="menu-toggle-bars" aria-hidden="true" />
        </button>
        <Link to="/" className="mobile-wordmark" onClick={() => setMenuOpen(false)}>
          BETWEEN
        </Link>
        <div className="mobile-bar-actions">
          {trailing}
          <button
            type="button"
            className="mobile-account-btn"
            aria-label="Account"
            aria-expanded={sheetOpen}
            aria-controls="user-sheet"
            onClick={openAccount}
          >
            <Avatar user={user} />
          </button>
        </div>
      </header>

      {menuOpen && (
        <button
          type="button"
          className="menu-backdrop desktop-only"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <nav
        className={`app-menu desktop-drawer${menuOpen ? ' open' : ''}`}
        aria-label="Main"
        hidden={!menuOpen}
      >
        <p className="app-menu-user">{user?.name}</p>
        <NavLink to="/" end className="app-menu-link" onClick={() => setMenuOpen(false)}>
          Lobby
        </NavLink>
        <NavLink to="/games" className="app-menu-link" onClick={() => setMenuOpen(false)}>
          Game list
        </NavLink>
        <button
          type="button"
          className="app-menu-link"
          onClick={() => {
            toggleTheme();
          }}
        >
          {theme === 'light' ? 'Dark mode' : 'Light mode'}
        </button>
        <button type="button" className="app-menu-link menu-signout" onClick={onLogout}>
          Sign out
        </button>
      </nav>

      <div
        className="mobile-menu"
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        hidden={!menuOpen}
      >
        <nav className="mobile-menu-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `mobile-nav-link${isActive ? ' active' : ''}`
            }
            onClick={() => setMenuOpen(false)}
          >
            Lobby
          </NavLink>
          <NavLink
            to="/games"
            className={({ isActive }) =>
              `mobile-nav-link${isActive ? ' active' : ''}`
            }
            onClick={() => setMenuOpen(false)}
          >
            Game list
          </NavLink>
        </nav>
        <div className="mobile-menu-footer">
          <button type="button" className="mobile-cta ghost-cta" onClick={toggleTheme}>
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
          <button type="button" className="mobile-cta" onClick={openAccount}>
            Account
          </button>
          <button
            type="button"
            className="mobile-cta ghost-cta"
            onClick={onLogout}
          >
            Log out
          </button>
        </div>
      </div>

      {sheetOpen && (
        <div
          className="user-sheet"
          id="user-sheet"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSheetOpen(false);
          }}
        >
          <div
            className="user-sheet-card"
            role="dialog"
            aria-labelledby="user-sheet-name"
          >
            <button
              type="button"
              className="icon-btn sheet-close"
              aria-label="Close account"
              onClick={() => setSheetOpen(false)}
            >
              ×
            </button>
            <div className="user-sheet-hero">
              <Avatar user={user} size="lg" />
              <div>
                <h2 id="user-sheet-name">{user?.name || 'Account'}</h2>
                <p className="note">{user?.email || ''}</p>
              </div>
            </div>
            <dl className="user-sheet-meta">
              <div>
                <dt>Sign-in</dt>
                <dd>{user?.provider || '—'}</dd>
              </div>
              <div>
                <dt>Theme</dt>
                <dd>{theme}</dd>
              </div>
            </dl>
            {trailing && <div className="user-sheet-trailing">{trailing}</div>}
            <button
              type="button"
              className="sheet-theme"
              onClick={toggleTheme}
            >
              Switch to {theme === 'light' ? 'dark' : 'light'} mode
            </button>
            <button type="button" className="sheet-logout" onClick={onLogout}>
              Log out
            </button>
          </div>
        </div>
      )}

      <main className="app-main">{children}</main>
      <SiteFooter onNavigate={closeAll} />
    </div>
  );
}
