import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { AboutPage } from './pages/AboutPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { ContactPage } from './pages/ContactPage';
import { GamePage } from './pages/GamePage';
import { GamesPage } from './pages/GamesPage';
import { LobbyPage } from './pages/LobbyPage';
import { LoginPage } from './pages/LoginPage';
import { PrivacyPage } from './pages/PrivacyPage';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="mobile-shell">
        <div className="app-main center">
          <p>Loading…</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/oauth/callback" element={<AuthCallbackPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <LobbyPage />
          </Protected>
        }
      />
      <Route
        path="/games"
        element={
          <Protected>
            <GamesPage />
          </Protected>
        }
      />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route
        path="/game/:code"
        element={
          <Protected>
            <GamePage />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
