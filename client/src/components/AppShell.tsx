import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';

function SignOutIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {open ? (
        <>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </>
      ) : (
        <>
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </>
      )}
    </svg>
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
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="mobile-shell">
      <header className="app-header">
        <button
          type="button"
          className="icon-btn"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <MenuIcon open={menuOpen} />
        </button>

        <Link to="/" className="app-brand">
          {title || 'Between'}
        </Link>

        <div className="app-header-actions">
          {trailing}
          <button
            type="button"
            className="icon-btn signout-btn"
            onClick={logout}
            aria-label="Sign out"
            title="Sign out"
          >
            <SignOutIcon />
          </button>
        </div>
      </header>

      {menuOpen && (
        <>
          <button
            type="button"
            className="menu-backdrop"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <nav className="app-menu" aria-label="Main">
            <p className="app-menu-user">{user?.name}</p>
            <NavLink to="/" end className="app-menu-link">
              Lobby
            </NavLink>
            <NavLink to="/games" className="app-menu-link">
              Game list
            </NavLink>
            <NavLink to="/about" className="app-menu-link">
              Who we are
            </NavLink>
            <button
              type="button"
              className="app-menu-link menu-signout"
              onClick={logout}
            >
              <SignOutIcon />
              Sign out
            </button>
          </nav>
        </>
      )}

      <main className="app-main">{children}</main>
    </div>
  );
}
