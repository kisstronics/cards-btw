import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { Loader } from '../components/Loader';
import { connectSocket, getSocket, type GameAck } from '../socket';
import type { GamePublic } from '../types';

function statusLabel(status: string) {
  switch (status) {
    case 'lobby':
      return 'Waiting';
    case 'playing':
      return 'Live';
    case 'ended':
      return 'Ended';
    default:
      return status;
  }
}

function formatWhen(ts?: number | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function GameInfoPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState<GamePublic | null>(null);
  const [error, setError] = useState('');
  const leftRef = useRef(false);

  useEffect(() => {
    leftRef.current = false;
    const socket = connectSocket();
    const room = code.toUpperCase();

    const onState = (state: GamePublic) => {
      if (leftRef.current) return;
      if (state.code !== room) return;
      setGame(state);
      setError('');
    };

    socket.on('game:state', onState);

    socket.emit('game:sync', {}, (ack: GameAck) => {
      if (leftRef.current) return;
      if (ack?.game?.code === room) {
        setGame(ack.game);
        return;
      }
      socket.emit('game:join', { code: room }, (joinAck: GameAck) => {
        if (leftRef.current) return;
        if (joinAck?.error) setError(joinAck.error);
        else if (joinAck?.game) setGame(joinAck.game);
      });
    });

    return () => {
      socket.off('game:state', onState);
    };
  }, [code]);

  function leave() {
    leftRef.current = true;
    const socket = getSocket() || connectSocket();
    socket.emit('game:leave', {}, () => {
      navigate('/', { replace: true });
    });
    setTimeout(() => navigate('/', { replace: true }), 800);
  }

  if (!game) {
    return (
      <AppShell title="Game info">
        <div className="center">
          {error ? (
            <>
              <p className="error">{error}</p>
              <Link className="btn secondary" to="/">
                Back to lobby
              </Link>
            </>
          ) : (
            <Loader label="Loading game info…" size="lg" />
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Game info">
      <section className="content-page game-info-page">
        <p className="game-info-code">{game.code}</p>
        <p className={`game-status status-${game.status}`}>
          {statusLabel(game.status)}
        </p>

        <dl className="game-times">
          <div>
            <dt>Created</dt>
            <dd>{formatWhen(game.createdAt)}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{formatWhen(game.startedAt)}</dd>
          </div>
          <div>
            <dt>Ended</dt>
            <dd>{formatWhen(game.endedAt)}</dd>
          </div>
        </dl>

        <dl className="game-info-meta">
          <div>
            <dt>Players</dt>
            <dd>
              {game.players.length}/{game.maxPlayers}
            </dd>
          </div>
          <div>
            <dt>Board</dt>
            <dd>{game.pot}</dd>
          </div>
        </dl>

        <ul className="player-list">
          {game.players.map((p) => (
            <li key={p.id}>
              <span>
                {p.name}
                {p.id === game.ownerId ? ' (host)' : ''}
              </span>
              <span className={p.chips < 0 ? 'negative' : ''}>
                {p.chips} pts
              </span>
            </li>
          ))}
        </ul>

        <div className="game-info-actions">
          {game.status !== 'ended' ? (
            <Link className="btn primary" to={`/game/${game.code}`}>
              Back to table
            </Link>
          ) : (
            <Link className="btn primary" to="/">
              Back to lobby
            </Link>
          )}
          {game.status !== 'ended' && (
            <button className="btn secondary" type="button" onClick={leave}>
              Leave table
            </button>
          )}
        </div>

        {error && <p className="error">{error}</p>}
      </section>
    </AppShell>
  );
}
