import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { connectSocket, getSocket, type GameAck } from '../socket';

export function LobbyPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState('');
  const [buyIn, setBuyIn] = useState(100);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const socket = connectSocket();
    const onState = (game: { code: string }) => {
      if (game?.code) navigate(`/game/${game.code}`);
    };
    socket.on('game:state', onState);
    socket.emit('game:sync', {}, (ack: GameAck) => {
      if (ack?.game?.code) navigate(`/game/${ack.game.code}`);
    });
    return () => {
      socket.off('game:state', onState);
    };
  }, [navigate]);

  function createGame(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const socket = getSocket() || connectSocket();
    socket.emit('game:create', { buyIn }, (ack: GameAck) => {
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
    socket.emit('game:join', { code: joinCode.trim().toUpperCase() }, (ack: GameAck) => {
      setBusy(false);
      if (ack?.error) setError(ack.error);
      else if (ack?.game) navigate(`/game/${ack.game.code}`);
    });
  }

  return (
    <div className="page lobby-page">
      <header className="topbar">
        <span className="brand-sm">Between</span>
        <div className="user-chip">
          {user?.picture && <img src={user.picture} alt="" />}
          <span>{user?.name}</span>
          <button type="button" className="linkish" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="lobby-main">
        <section className="lobby-hero">
          <h1>Ready for a hand?</h1>
          <p>Between for 2–6 players. Host keeps the table open until they end it.</p>
        </section>

        <div className="lobby-actions">
          <form className="action-block" onSubmit={createGame}>
            <h2>Create game</h2>
            <p className="muted">Game type: Between</p>
            <label>
              Starting chips
              <input
                type="number"
                min={20}
                max={1000}
                value={buyIn}
                onChange={(e) => setBuyIn(Number(e.target.value))}
              />
            </label>
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
      </main>
    </div>
  );
}
