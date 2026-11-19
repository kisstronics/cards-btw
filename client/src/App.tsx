import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { GamePage } from './pages/GamePage';
import { LobbyPage } from './pages/LobbyPage';
import { LoginPage } from './pages/LoginPage';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="page center">
        <p>Loading…</p>
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
