import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { connectSocket, getSocket, type GameAck } from '../socket';

export function LobbyPage() {
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resumeCode, setResumeCode] = useState<string | null>(null);

  useEffect(() => {
    const socket = connectSocket();
    socket.emit('game:sync', {}, (ack: GameAck) => {
      if (ack?.game?.code) setResumeCode(ack.game.code);
      else setResumeCode(null);
    });
  }, []);

  function createGame(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const socket = getSocket() || connectSocket();
    socket.emit('game:create', {}, (ack: GameAck) => {
      setBusy(false);
      if (ack?.error) setError(ack.error);
      else if (ack?.game) navigate(`/game/${ack.game.code}`);
    });
  }

  function joinGame(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const socket = getSocket() || connectSocket();
    socket.emit(
      'game:join',
      { code: joinCode.trim().toUpperCase() },
      (ack: GameAck) => {
        setBusy(false);
        if (ack?.error) setError(ack.error);
        else if (ack?.game) navigate(`/game/${ack.game.code}`);
      },
    );
  }

  return (
    <AppShell>
      <section className="lobby-hero">
        <h1>Ready for a hand?</h1>
        <p>
          Host keeps the table open until they end it. Everyone starts at 0;
          scores can go negative.
        </p>
      </section>

      {resumeCode && (
        <div className="resume-banner">
          <p>
            You’re still at table <strong>{resumeCode}</strong>
          </p>
          <button
            type="button"
            className="btn primary"
            onClick={() => navigate(`/game/${resumeCode}`)}
          >
            Resume
          </button>
        </div>
      )}

      <div className="lobby-actions">
        <form className="action-block" onSubmit={createGame}>
          <h2>Create game</h2>
          <p className="muted">Game type: Between · 2–6 players</p>
          <button className="btn primary" disabled={busy} type="submit">
            Create room
          </button>
        </form>

        <form className="action-block" onSubmit={joinGame}>
          <h2>Join game</h2>
          <p className="muted">Enter the 6-character room code</p>
          <label>
            Room code
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              required
            />
          </label>
          <button className="btn secondary" disabled={busy} type="submit">
            Join room
          </button>
        </form>
      </div>

      {error && <p className="error">{error}</p>}
    </AppShell>
  );
}
