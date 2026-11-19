import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { CardView } from '../components/CardView';
import { connectSocket, getSocket, type GameAck } from '../socket';
import type { GamePublic, PlayerPublic, PlayerTurnStatus } from '../types';

function statusLabel(status: PlayerTurnStatus) {
  switch (status) {
    case 'betting':
      return 'Betting';
    case 'waiting':
      return 'Waiting';
    case 'done':
      return 'Done';
    default:
      return '';
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

/** Place seats around an oval; index 0 sits at the bottom (you). */
function seatStyle(index: number, total: number): CSSProperties {
  const angle = Math.PI / 2 + (2 * Math.PI * index) / total;
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  return {
    left: `${50 + x * 46}%`,
    top: `${50 + y * 42}%`,
  };
}

function PlayerSeat({
  player,
  isDealer,
  isYou,
  style,
  handVisible,
  onToggleHand,
  turnSeconds,
}: {
  player: PlayerPublic;
  isDealer: boolean;
  isYou: boolean;
  style: CSSProperties;
  handVisible: boolean;
  onToggleHand?: () => void;
  turnSeconds?: number | null;
}) {
  const hasYourHand = isYou && Boolean(player.hand);
  const showCards = hasYourHand && handVisible;
  const showTimer =
    player.turnStatus === 'betting' &&
    typeof turnSeconds === 'number' &&
    turnSeconds >= 0;

  return (
    <div
      className={`seat ${player.turnStatus === 'betting' ? 'active' : ''} ${!player.connected ? 'away' : ''} ${isYou ? 'you' : ''} ${showCards ? 'revealed' : ''}`}
      style={style}
    >
      {showTimer && (
        <span
          className={`turn-timer-badge ${turnSeconds! <= 5 ? 'urgent' : ''}`}
          aria-label={`${turnSeconds} seconds left`}
        >
          {turnSeconds}s
        </span>
      )}
      <div className="seat-name">
        <span className="seat-name-text" title={player.name}>
          {isYou ? 'You' : firstName(player.name)}
        </span>
        {isDealer && <em>D</em>}
      </div>
      <div className={`seat-status status-${player.turnStatus}`}>
        {statusLabel(player.turnStatus)}
      </div>
      {hasYourHand && onToggleHand && (
        <button
          type="button"
          className="hand-toggle"
          onClick={onToggleHand}
          aria-pressed={handVisible}
          aria-label={handVisible ? 'Hide your cards' : 'Show your cards'}
        >
          {handVisible ? 'Hide cards' : 'Show cards'}
        </button>
      )}
      {showCards && (
        <div className="seat-hand">
          <CardView card={player.hand![0]} />
          <CardView card={player.hand![1]} />
        </div>
      )}
      <div
        className={`seat-chips ${player.chips < 0 ? 'negative' : ''}`}
      >
        {player.chips}
      </div>
    </div>
  );
}

export function GamePage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState<GamePublic | null>(null);
  const [betAmount, setBetAmount] = useState(10);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [handVisible, setHandVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [turnSeconds, setTurnSeconds] = useState<number | null>(null);
  const leftRef = useRef(false);

  useEffect(() => {
    leftRef.current = false;
    setLeaving(false);
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
      // Not already seated in this room — try joining by code.
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

  const bettor = useMemo(() => {
    if (!game?.round) return null;
    return game.players.find((p) => p.seat === game.round!.bettorSeat) || null;
  }, [game]);

  const maxBet = useMemo(() => {
    if (!game) return 0;
    // Max bet = board amount (scores may go negative)
    return Math.max(0, game.pot);
  }, [game]);

  const minBet = useMemo(() => {
    if (maxBet <= 0) return 0;
    return Math.min(5, maxBet);
  }, [maxBet]);

  useEffect(() => {
    if (maxBet <= 0) return;
    setBetAmount((current) => Math.min(Math.max(current, minBet), maxBet));
  }, [minBet, maxBet]);

  // Shared countdown from server deadline — visible on every client
  useEffect(() => {
    const deadline = game?.round?.turnDeadlineAt;
    const open = game?.round?.phase === 'awaiting_bet' && deadline;
    if (!open) {
      setTurnSeconds(null);
      return;
    }

    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTurnSeconds(left);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [game?.round?.turnDeadlineAt, game?.round?.phase]);

  // Hide cards again whenever a new hand is dealt
  const handKey = game?.you?.hand
    ? `${game.you.hand[0].rank}${game.you.hand[0].suit}-${game.you.hand[1].rank}${game.you.hand[1].suit}`
    : '';
  useEffect(() => {
    setHandVisible(false);
  }, [handKey]);

  /** Rotate so the current player sits at the bottom of the oval. */
  const seatedPlayers = useMemo(() => {
    if (!game) return [];
    const youId = game.you?.id;
    const ordered = [...game.players].sort((a, b) => a.seat - b.seat);
    if (!youId) return ordered;
    const youIndex = ordered.findIndex((p) => p.id === youId);
    if (youIndex <= 0) return ordered;
    return [...ordered.slice(youIndex), ...ordered.slice(0, youIndex)];
  }, [game]);

  function emit(event: string, payload: object) {
    const socket = getSocket() || connectSocket();
    socket.emit(event, payload, (ack: GameAck) => {
      if (ack?.error) setError(ack.error);
    });
  }

  function copyCode() {
    navigator.clipboard.writeText(game?.code || code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function leave() {
    if (leaving) return;
    setLeaving(true);
    leftRef.current = true;
    const socket = getSocket() || connectSocket();
    socket.emit('game:leave', {}, () => {
      navigate('/', { replace: true });
    });
    // Fallback if ack never arrives
    setTimeout(() => navigate('/', { replace: true }), 800);
  }

  if (!game) {
    return (
      <AppShell>
        <div className="center">
          <p>{error || 'Loading table…'}</p>
          {error && (
            <Link className="btn secondary" to="/">
              Back to lobby
            </Link>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Table"
      trailing={
        <button
          type="button"
          className="btn secondary leave-btn"
          onClick={leave}
          disabled={leaving}
        >
          {leaving ? 'Leaving…' : 'Leave'}
        </button>
      }
    >
      <div className="game-page">
        <div className="room-meta game-room-meta">
          <button type="button" className="code-pill" onClick={copyCode}>
            {game.code} {copied ? '✓' : 'copy'}
          </button>
        </div>

        <dl className="game-times board-times">
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

      {game.status === 'lobby' && (
        <section className="lobby-wait">
          <h1>Waiting room</h1>
          <p>
            {game.players.length}/{game.maxPlayers} players · need at least{' '}
            {game.minPlayers} to start
          </p>
          <ul className="player-list">
            {game.players.map((p) => (
              <li key={p.id}>
                <span>
                  {p.name}
                  {p.id === game.ownerId ? ' (host)' : ''}
                </span>
                <span className="muted">{p.chips} pts</span>
              </li>
            ))}
          </ul>
          {game.you?.canStart && (
            <button
              className="btn primary"
              type="button"
              onClick={() => emit('game:start', { code: game.code })}
            >
              Start game
            </button>
          )}
          {!game.you?.isOwner && (
            <p className="muted">Waiting for the host to start…</p>
          )}
        </section>
      )}

      {game.status === 'playing' && game.round && (
        <section className="table">
          <div className="table-meta">
            <div className="board-amount" aria-label="Board amount">
              <span className="board-amount-label">Board</span>
              <strong className="board-amount-value">{game.pot}</strong>
            </div>
            {game.you?.canEnd ? (
              <button
                className="btn danger end-game-btn"
                type="button"
                onClick={() => emit('game:end', { code: game.code })}
              >
                End game
              </button>
            ) : (
              <span className="table-meta-spacer" aria-hidden="true" />
            )}
          </div>

          <div className="table-arena">
            <div className="table-felt">
              <div className="deck-stack" title={`${game.deckRemaining} left`}>
                <CardView faceDown />
                <span>{game.deckRemaining}</span>
              </div>

              <div className="board-center">
                <p className="board-label">Draw</p>
                <CardView
                  card={game.round.thirdCard}
                  faceDown={!game.round.thirdCard}
                  highlight={
                    game.round.phase === 'resolved' ||
                    game.round.phase === 'revealing'
                  }
                />
              </div>

              <p className="turn-line">
                <strong>{bettor?.name}</strong>
                {game.round.phase === 'awaiting_bet' && ' · bet or skip'}
                {game.round.phase === 'resolved' &&
                  (game.round.lastResult?.won ? ' · won!' : ' · lost')}
              </p>

              {game.round.lastResult && (
                <p
                  className={`result-banner ${game.round.lastResult.won ? 'win' : 'lose'}`}
                >
                  {game.round.lastResult.message}
                </p>
              )}
            </div>

            {seatedPlayers.map((p, i) => (
              <PlayerSeat
                key={p.id}
                player={p}
                isDealer={game.round!.dealerSeat === p.seat}
                isYou={p.id === game.you?.id}
                style={seatStyle(i, seatedPlayers.length)}
                handVisible={handVisible}
                turnSeconds={
                  p.turnStatus === 'betting' ? turnSeconds : null
                }
                onToggleHand={
                  p.id === game.you?.id
                    ? () => setHandVisible((v) => !v)
                    : undefined
                }
              />
            ))}
          </div>

          <div className="controls">
            {game.you?.canBet && (
              <div className="bet-panel">
                <div className="bet-stepper">
                  <button
                    type="button"
                    className="btn secondary bet-step"
                    disabled={betAmount <= minBet}
                    onClick={() =>
                      setBetAmount((v) => Math.max(minBet, v - 10))
                    }
                    aria-label="Decrease bet by 10"
                  >
                    −10
                  </button>
                  <div className="bet-amount" aria-live="polite">
                    <span className="bet-amount-label">Bet</span>
                    <strong>{betAmount}</strong>
                  </div>
                  <button
                    type="button"
                    className="btn secondary bet-step"
                    disabled={betAmount >= maxBet}
                    onClick={() =>
                      setBetAmount((v) => Math.min(maxBet, v + 10))
                    }
                    aria-label="Increase bet by 10"
                  >
                    +10
                  </button>
                </div>
                <div className="bet-actions">
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={maxBet <= 0 || betAmount === maxBet}
                    onClick={() => setBetAmount(maxBet)}
                  >
                    Max ({maxBet})
                  </button>
                  <button
                    className="btn primary"
                    type="button"
                    disabled={maxBet <= 0}
                    onClick={() =>
                      emit('game:bet', { code: game.code, amount: betAmount })
                    }
                  >
                    Bet {betAmount}
                  </button>
                </div>
              </div>
            )}
            {game.you?.canSkip && (
              <button
                className="btn secondary"
                type="button"
                onClick={() => emit('game:skip', { code: game.code })}
              >
                Skip
              </button>
            )}
            {!game.you?.isBettor && game.round.phase === 'awaiting_bet' && (
              <p className="muted controls-wait">
                Waiting for {bettor?.name}…
              </p>
            )}
            {game.you?.isBettor &&
              game.you.canSkip &&
              !game.you.canBet &&
              game.round.phase === 'awaiting_bet' && (
                <p className="muted controls-wait">
                  No between on your cards — skip to continue
                </p>
              )}
          </div>
        </section>
      )}

      {game.status === 'ended' && (
        <section className="lobby-wait">
          <h1>Game ended</h1>
          <ul className="player-list">
            {[...game.players]
              .sort((a, b) => b.chips - a.chips)
              .map((p) => (
                <li key={p.id}>
                  <span>{p.name}</span>
                  <span>{p.chips} pts</span>
                </li>
              ))}
          </ul>
          <Link className="btn primary" to="/">
            Back to lobby
          </Link>
        </section>
      )}

      {error && <p className="error">{error}</p>}
      </div>
    </AppShell>
  );
}
