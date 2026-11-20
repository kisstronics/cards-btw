import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchGames, type GameListItem } from '../api';
import { AppShell } from '../components/AppShell';
import { Loader } from '../components/Loader';
import { connectSocket, getSocket, type GameAck } from '../socket';

function statusLabel(status: string) {
  switch (status) {
    case 'lobby':
      return 'Open';
    case 'playing':
      return 'Live';
    case 'ended':
      return 'Ended';
    default:
      return status;
  }
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function formatWhen(ts?: number | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function GamesPage() {
  const navigate = useNavigate();
  const [games, setGames] = useState<GameListItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchGames();
        if (!cancelled) setGames(data.games);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load games');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function join(code: string) {
    setJoining(code);
    setError('');
    const socket = getSocket() || connectSocket();
    socket.emit('game:join', { code }, (ack: GameAck) => {
      setJoining(null);
      if (ack?.error) setError(ack.error);
      else if (ack?.game) navigate(`/game/${ack.game.code}`);
    });
  }

  return (
    <AppShell title="Games">
      <section className="content-page">
        <h1>Game list</h1>
        <p className="muted">
          Only tables you’ve created or joined. Share a room code so friends can
          enter from the lobby.
        </p>

        {loading && <Loader label="Loading games…" size="md" />}
        {error && <p className="error">{error}</p>}

        {!loading && games.length === 0 && (
          <p className="muted">
            No games yet. Create a room or join with a shared code.
          </p>
        )}

        <ul className="game-list">
          {games.map((g) => (
            <li key={g.code} className="game-list-item">
              <div className="game-list-main">
                <strong className="game-list-code">{g.code}</strong>
                <span className={`game-status status-${g.status}`}>
                  {statusLabel(g.status)}
                </span>
              </div>
              <div className="game-list-meta muted">
                <span>{g.ownerName}</span>
                <span>
                  {g.playerCount}/{g.maxPlayers}
                </span>
                {g.status !== 'lobby' && <span>Board {g.pot}</span>}
              </div>

              <dl className="game-times">
                <div>
                  <dt>Created</dt>
                  <dd>{formatWhen(g.createdAt)}</dd>
                </div>
                <div>
                  <dt>Started</dt>
                  <dd>{formatWhen(g.startedAt)}</dd>
                </div>
                <div>
                  <dt>Ended</dt>
                  <dd>{formatWhen(g.endedAt)}</dd>
                </div>
              </dl>

              {g.players && g.players.length > 0 && (
                <ul className="game-stats">
                  {g.players.map((p) => (
                    <li key={p.id}>
                      <span className="game-stats-name" title={p.name}>
                        {firstName(p.name)}
                      </span>
                      <span
                        className={`game-stats-score ${p.score < 0 ? 'negative' : ''}`}
                      >
                        {p.score} pts
                      </span>
                      <span className="game-stats-rounds muted">
                        {p.roundsPlayed}{' '}
                        {p.roundsPlayed === 1 ? 'round' : 'rounds'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {g.joinable && g.status !== 'ended' ? (
                <button
                  type="button"
                  className="btn secondary game-list-join"
                  disabled={joining === g.code}
                  onClick={() => join(g.code)}
                >
                  {joining === g.code ? (
                    <Loader label="" size="sm" />
                  ) : g.canRejoin ? (
                    'Rejoin'
                  ) : (
                    'Join'
                  )}
                </button>
              ) : (
                <span className="game-list-locked muted">
                  {g.status === 'ended'
                    ? 'Ended'
                    : g.status === 'playing'
                      ? 'In progress'
                      : 'Full'}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
