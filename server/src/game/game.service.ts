import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import {
  Card,
  createDeck,
  hasBetween,
  isBetween,
  shuffle,
} from './cards';
import {
  GamePublic,
  InternalGame,
  InternalPlayer,
  PlayerTurnStatus,
} from './game.types';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
/** Everyone starts at 0; balances may go negative. */
const STARTING_CHIPS = 0;
/** Each player antes this much onto the board at start and whenever the board hits 0. */
const ANTE = 10;
const DEFAULT_BET = 10;
const MIN_BET = 5;
/** Seconds a player has to bet or skip before auto-skip. */
const TURN_SECONDS = 30;

function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

@Injectable()
export class GameService implements OnModuleInit {
  private readonly logger = new Logger(GameService.name);
  private games = new Map<string, InternalGame>();
  private playerToGame = new Map<string, string>();

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    try {
      const loaded = await this.db.loadActiveGames();
      for (const game of loaded) {
        this.games.set(game.code, game);
        for (const player of game.players) {
          this.playerToGame.set(player.id, game.code);
        }
      }
      if (loaded.length) {
        this.logger.log(`Restored ${loaded.length} active game(s) from DB`);
      }
    } catch (err) {
      this.logger.warn(
        `Could not restore games: ${(err as Error).message}`,
      );
    }
  }

  async createGame(owner: { id: string; name: string; picture?: string }) {
    await this.leaveAnyGame(owner.id);

    let code = generateCode();
    while (this.games.has(code)) {
      code = generateCode();
    }

    const game: InternalGame = {
      code,
      status: 'lobby',
      ownerId: owner.id,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      buyIn: STARTING_CHIPS,
      pot: 0,
      deck: [],
      players: [
        {
          id: owner.id,
          name: owner.name,
          picture: owner.picture,
          chips: STARTING_CHIPS,
          seat: 0,
          connected: true,
          socketIds: new Set(),
          hand: null,
          actedThisOrbit: false,
          roundsPlayed: 0,
        },
      ],
      round: null,
      createdAt: Date.now(),
      startedAt: null,
      endedAt: null,
    };

    this.games.set(code, game);
    this.playerToGame.set(owner.id, code);
    await this.persist(game);
    return this.toPublic(game, owner.id);
  }

  async joinGame(
    code: string,
    player: { id: string; name: string; picture?: string },
  ) {
    const game = this.requireGame(code.toUpperCase());
    if (game.status === 'ended') {
      throw new BadRequestException('This game has ended');
    }

    const existing = game.players.find((p) => p.id === player.id);
    if (existing) {
      // Already on the roster — allow rejoin while lobby or playing.
      if (game.status !== 'lobby' && game.status !== 'playing') {
        throw new BadRequestException('Cannot join this game');
      }
      existing.connected = true;
      existing.name = player.name || existing.name;
      existing.picture = player.picture || existing.picture;
      this.playerToGame.set(player.id, game.code);
      await this.persist(game);
      return this.toPublic(game, player.id);
    }

    // New players may only join before the host starts.
    if (game.status !== 'lobby') {
      throw new BadRequestException(
        'Game already started — only existing players can rejoin',
      );
    }
    if (game.players.length >= game.maxPlayers) {
      throw new BadRequestException('Game is full');
    }

    await this.leaveAnyGame(player.id);

    const newPlayer: InternalPlayer = {
      id: player.id,
      name: player.name,
      picture: player.picture,
      chips: STARTING_CHIPS,
      seat: game.players.length,
      connected: true,
      socketIds: new Set(),
      hand: null,
      actedThisOrbit: false,
      roundsPlayed: 0,
    };

    game.players.push(newPlayer);
    this.playerToGame.set(player.id, game.code);
    await this.persist(game);
    await this.db
      .recordAction({
        gameCode: game.code,
        userId: player.id,
        action: 'join',
        potAfter: game.pot,
        chipsAfter: newPlayer.chips,
        message: `${player.name} joined`,
      })
      .catch(() => undefined);
    return this.toPublic(game, player.id);
  }

  async leaveGame(playerId: string) {
    const code = this.playerToGame.get(playerId);
    if (!code) return null;
    const game = this.games.get(code);
    if (!game) {
      this.playerToGame.delete(playerId);
      return null;
    }

    if (game.status === 'lobby') {
      game.players = game.players.filter((p) => p.id !== playerId);
      this.playerToGame.delete(playerId);
      if (game.players.length === 0) {
        this.games.delete(code);
        await this.db.deleteGame(code).catch((err) => {
          this.logger.warn(`deleteGame failed: ${(err as Error).message}`);
        });
        return null;
      }
      if (game.ownerId === playerId) {
        game.ownerId = game.players[0].id;
      }
      game.players.forEach((p, i) => {
        p.seat = i;
      });
      await this.persist(game);
      return this.toPublic(game);
    }

    const player = game.players.find((p) => p.id === playerId);
    if (player) {
      player.connected = false;
      player.socketIds.clear();
    }
    // Always detach from the room so Leave / sync won't bounce them back in.
    this.playerToGame.delete(playerId);
    await this.persist(game);
    return this.toPublic(game);
  }

  async attachSocket(playerId: string, socketId: string) {
    const game = this.getGameForPlayer(playerId);
    if (!game) return null;
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return null;
    player.socketIds.add(socketId);
    player.connected = true;
    await this.persist(game);
    return this.toPublic(game, playerId);
  }

  async detachSocket(playerId: string, socketId: string) {
    const game = this.getGameForPlayer(playerId);
    if (!game) return null;
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return null;
    player.socketIds.delete(socketId);
    if (player.socketIds.size === 0) {
      player.connected = false;
    }
    await this.persist(game);
    return this.toPublic(game);
  }

  async startGame(code: string, requesterId: string) {
    const game = this.requireGame(code);
    if (game.ownerId !== requesterId) {
      throw new ForbiddenException('Only the owner can start the game');
    }
    if (game.status !== 'lobby') {
      throw new BadRequestException('Game already started');
    }
    if (game.players.length < game.minPlayers) {
      throw new BadRequestException(
        `Need at least ${game.minPlayers} players to start`,
      );
    }

    game.players = shuffle(game.players).map((p, i) => ({
      ...p,
      seat: i,
      chips: STARTING_CHIPS,
      hand: null,
      actedThisOrbit: false,
      roundsPlayed: 0,
    }));
    game.pot = 0;
    game.deck = shuffle(createDeck());
    game.status = 'playing';
    game.startedAt = Date.now();
    game.endedAt = null;
    await this.beginOrbit(game, 0);
    await this.persist(game);
    return this.toPublic(game, requesterId);
  }

  async endGame(code: string, requesterId: string) {
    const game = this.requireGame(code);
    if (game.ownerId !== requesterId) {
      throw new ForbiddenException('Only the owner can end the game');
    }
    game.status = 'ended';
    game.endedAt = Date.now();
    game.round = null;
    game.players.forEach((p) => {
      p.hand = null;
      p.actedThisOrbit = false;
    });
    await this.persist(game);
    await this.db.saveScores(game).catch((err) => {
      this.logger.warn(`saveScores failed: ${(err as Error).message}`);
    });
    await this.db
      .recordAction({
        gameCode: game.code,
        userId: requesterId,
        action: 'end',
        message: 'Game ended',
      })
      .catch(() => undefined);
    return this.toPublic(game, requesterId);
  }

  async placeBet(code: string, playerId: string, amount: number) {
    const game = this.requireGame(code);
    this.assertPlaying(game);
    const round = game.round!;
    if (round.phase !== 'awaiting_bet') {
      throw new BadRequestException('Betting is not open');
    }

    const bettor = this.playerAtSeat(game, round.bettorSeat);
    if (bettor.id !== playerId) {
      throw new ForbiddenException('Not your turn to bet');
    }
    if (!bettor.hand) {
      throw new BadRequestException('No cards dealt');
    }
    if (!hasBetween(bettor.hand[0], bettor.hand[1])) {
      throw new BadRequestException('No between available on your cards');
    }
    if (game.pot <= 0) {
      throw new BadRequestException('Board is empty — ante required');
    }

    const bet = Math.floor(amount);
    // Max bet is the board amount; chips may go negative.
    const maxBet = game.pot;
    const minBet = Math.min(MIN_BET, maxBet);
    if (bet < minBet || bet > maxBet) {
      throw new BadRequestException(
        `Bet must be between ${minBet} and ${maxBet} (cannot exceed board)`,
      );
    }

    round.phase = 'revealing';
    round.turnDeadlineAt = null;
    const third = this.draw(game);
    round.thirdCard = third;

    const won = isBetween(third, bettor.hand[0], bettor.hand[1]);
    if (won) {
      game.pot -= bet;
      bettor.chips += bet;
      round.lastResult = {
        bettorId: bettor.id,
        bettorName: bettor.name,
        amount: bet,
        won: true,
        message:
          game.pot === 0
            ? `${bettor.name} won ${bet} and cleared the board`
            : `${bettor.name} won ${bet} from the board (${game.pot} left)`,
      };
    } else {
      bettor.chips -= bet;
      game.pot += bet;
      round.lastResult = {
        bettorId: bettor.id,
        bettorName: bettor.name,
        amount: bet,
        won: false,
        message: `${bettor.name} lost ${bet} — board is now ${game.pot}`,
      };
    }

    bettor.actedThisOrbit = true;
    bettor.roundsPlayed = (bettor.roundsPlayed || 0) + 1;
    round.phase = 'resolved';

    const clearedBoard = won && game.pot === 0;
    const clearerSeat = bettor.seat;

    await this.persist(game);
    await this.db
      .recordAction({
        gameCode: game.code,
        userId: bettor.id,
        action: won ? 'bet_win' : 'bet_lose',
        amount: bet,
        potAfter: game.pot,
        chipsAfter: bettor.chips,
        message: round.lastResult?.message,
      })
      .catch(() => undefined);

    return {
      public: this.toPublic(game, playerId),
      delayMs: 1800,
      next: async () => {
        if (clearedBoard) {
          await this.beginOrbit(game, clearerSeat);
        } else {
          await this.advanceToNextBettor(game);
        }
        await this.persist(game);
        return this.toPublic(game);
      },
    };
  }

  async skipBet(code: string, playerId: string) {
    const game = this.requireGame(code);
    this.assertPlaying(game);
    const round = game.round!;
    if (round.phase !== 'awaiting_bet') {
      throw new BadRequestException('Cannot skip right now');
    }

    const bettor = this.playerAtSeat(game, round.bettorSeat);
    if (bettor.id !== playerId) {
      throw new ForbiddenException('Not your turn');
    }

    return this.resolveSkip(game, bettor, false, playerId);
  }

  /** Server-driven skip when the 30s turn timer expires. */
  async autoSkipTurn(code: string) {
    const game = this.requireGame(code);
    this.assertPlaying(game);
    const round = game.round!;
    if (round.phase !== 'awaiting_bet') {
      return this.toPublic(game);
    }
    if (round.turnDeadlineAt && Date.now() < round.turnDeadlineAt - 250) {
      // Timer fired early — ignore
      return this.toPublic(game);
    }

    const bettor = this.playerAtSeat(game, round.bettorSeat);
    return this.resolveSkip(game, bettor, true);
  }

  /** Remaining ms until auto-skip, or null if no open turn. */
  turnMsRemaining(code: string): number | null {
    const game = this.games.get(code.toUpperCase());
    if (!game?.round || game.round.phase !== 'awaiting_bet') return null;
    if (!game.round.turnDeadlineAt) return null;
    return Math.max(0, game.round.turnDeadlineAt - Date.now());
  }

  getPublicForPlayer(playerId: string): GamePublic | null {
    const game = this.getGameForPlayer(playerId);
    if (!game) return null;
    return this.toPublic(game, playerId);
  }

  getGameByCode(code: string, viewerId?: string): GamePublic {
    return this.toPublic(this.requireGame(code.toUpperCase()), viewerId);
  }

  betLimits() {
    return { min: MIN_BET, max: 'board', default: DEFAULT_BET, ante: ANTE };
  }

  async listGames(viewerId?: string) {
    if (!viewerId) {
      return { games: [] };
    }

    // Only games this user created or joined — never a public directory.
    const live = [...this.games.values()]
      .filter((g) => g.status === 'lobby' || g.status === 'playing')
      .filter(
        (g) =>
          g.ownerId === viewerId || g.players.some((p) => p.id === viewerId),
      )
      .map((g) => {
        const owner = g.players.find((p) => p.id === g.ownerId);
        const players = [...g.players]
          .sort((a, b) => b.chips - a.chips)
          .map((p) => ({
            id: p.id,
            name: p.name,
            score: p.chips,
            roundsPlayed: p.roundsPlayed || 0,
          }));
        const canRejoin = g.status === 'playing';
        return {
          code: g.code,
          status: g.status,
          playerCount: g.players.length,
          maxPlayers: g.maxPlayers,
          pot: g.pot,
          ownerName: owner?.name || 'Host',
          createdAt: g.createdAt,
          startedAt: g.startedAt,
          endedAt: g.endedAt,
          joinable: true,
          canRejoin,
          players,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    const recent = await this.db.listRecentGamesForUser(viewerId, 30);
    const liveCodes = new Set(live.map((g) => g.code));
    const rest = recent.filter((g) => !liveCodes.has(g.code));

    return { games: [...live, ...rest] };
  }

  private async leaveAnyGame(playerId: string) {
    if (this.playerToGame.get(playerId)) {
      await this.leaveGame(playerId);
    }
  }

  private getGameForPlayer(playerId: string) {
    const code = this.playerToGame.get(playerId);
    if (!code) return null;
    return this.games.get(code) || null;
  }

  private requireGame(code: string) {
    const game = this.games.get(code.toUpperCase());
    if (!game) {
      throw new NotFoundException('Game not found');
    }
    return game;
  }

  private assertPlaying(game: InternalGame) {
    if (game.status !== 'playing') {
      throw new BadRequestException('Game is not in progress');
    }
    if (!game.round) {
      throw new BadRequestException('No active round');
    }
  }

  private playerAtSeat(game: InternalGame, seat: number): InternalPlayer {
    const player = game.players.find((p) => p.seat === seat);
    if (!player) {
      throw new BadRequestException('Invalid seat');
    }
    return player;
  }

  private draw(game: InternalGame): Card {
    if (game.deck.length === 0) {
      game.deck = shuffle(createDeck());
    }
    return game.deck.pop()!;
  }

  private ensureDeck(game: InternalGame, needed: number) {
    if (game.deck.length < needed) {
      game.deck = shuffle(createDeck());
    }
  }

  /** Each player puts ANTE onto the board (chips may go negative). */
  private async collectAnte(game: InternalGame) {
    for (const player of game.players) {
      player.chips -= ANTE;
      game.pot += ANTE;
      await this.db
        .recordAction({
          gameCode: game.code,
          userId: player.id,
          action: 'ante',
          amount: ANTE,
          potAfter: game.pot,
          chipsAfter: player.chips,
          message: `${player.name} anted ${ANTE}`,
        })
        .catch(() => undefined);
    }
  }

  private async resolveSkip(
    game: InternalGame,
    bettor: InternalPlayer,
    timedOut: boolean,
    viewerId?: string,
  ) {
    const round = game.round!;
    bettor.actedThisOrbit = true;
    bettor.roundsPlayed = (bettor.roundsPlayed || 0) + 1;
    round.turnDeadlineAt = null;
    round.lastResult = {
      bettorId: bettor.id,
      bettorName: bettor.name,
      amount: 0,
      won: false,
      message: timedOut
        ? `${bettor.name} ran out of time — skipped`
        : `${bettor.name} skipped`,
    };

    await this.advanceToNextBettor(game);
    await this.persist(game);
    await this.db
      .recordAction({
        gameCode: game.code,
        userId: bettor.id,
        action: timedOut ? 'timeout_skip' : 'skip',
        amount: 0,
        potAfter: game.pot,
        chipsAfter: bettor.chips,
        message: round.lastResult.message,
      })
      .catch(() => undefined);
    return this.toPublic(game, viewerId);
  }

  /** Drop all hands and deal 2 private cards; dealer serves, next seat picks. */
  private async beginOrbit(game: InternalGame, dealerSeat: number) {
    if (game.pot <= 0) {
      await this.collectAnte(game);
    }

    this.ensureDeck(game, game.players.length * 2 + 3);
    game.players.forEach((p) => {
      p.hand = [this.draw(game), this.draw(game)];
      p.actedThisOrbit = false;
    });

    const bettorSeat = (dealerSeat + 1) % game.players.length;
    game.round = {
      dealerSeat,
      bettorSeat,
      thirdCard: null,
      phase: 'awaiting_bet',
      turnDeadlineAt: Date.now() + TURN_SECONDS * 1000,
    };
  }

  private openBettorTurn(game: InternalGame, bettorSeat: number) {
    game.round!.bettorSeat = bettorSeat;
    game.round!.thirdCard = null;
    game.round!.phase = 'awaiting_bet';
    game.round!.turnDeadlineAt = Date.now() + TURN_SECONDS * 1000;
  }

  /**
   * After a skip or failed bet, give the next player a turn.
   * When everyone has acted (all skip/fail, or finished the deal), serve new cards.
   */
  private async advanceToNextBettor(game: InternalGame) {
    if (!game.round) return;

    const n = game.players.length;
    const current = game.round.bettorSeat;

    for (let step = 1; step <= n; step += 1) {
      const seat = (current + step) % n;
      const player = this.playerAtSeat(game, seat);
      if (!player.actedThisOrbit) {
        this.openBettorTurn(game, seat);
        return;
      }
    }

    const nextDealer = (game.round.dealerSeat + 1) % n;
    await this.beginOrbit(game, nextDealer);
  }

  private async persist(game: InternalGame) {
    try {
      await this.db.saveGame(game);
    } catch (err) {
      this.logger.warn(`persist failed: ${(err as Error).message}`);
    }
  }

  private turnStatusFor(
    game: InternalGame,
    player: InternalPlayer,
  ): PlayerTurnStatus {
    if (game.status !== 'playing' || !game.round) return 'idle';
    if (
      player.seat === game.round.bettorSeat &&
      game.round.phase === 'awaiting_bet'
    ) {
      return 'betting';
    }
    if (player.actedThisOrbit) return 'done';
    if (game.round.phase !== 'awaiting_bet') return 'waiting';
    return 'waiting';
  }

  private toPublic(game: InternalGame, viewerId?: string): GamePublic {
    const sorted = [...game.players].sort((a, b) => a.seat - b.seat);
    const round = game.round
      ? {
          dealerSeat: game.round.dealerSeat,
          bettorSeat: game.round.bettorSeat,
          thirdCard: game.round.thirdCard,
          phase: game.round.phase,
          turnDeadlineAt: game.round.turnDeadlineAt ?? null,
          lastResult: game.round.lastResult,
        }
      : null;

    const publicGame: GamePublic = {
      code: game.code,
      status: game.status,
      gameType: 'between',
      ownerId: game.ownerId,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
      buyIn: game.buyIn,
      pot: game.pot,
      deckRemaining: game.deck.length,
      createdAt: game.createdAt,
      startedAt: game.startedAt,
      endedAt: game.endedAt,
      players: sorted.map((p) => {
        const isSelf = viewerId === p.id;
        return {
          id: p.id,
          name: p.name,
          picture: p.picture,
          chips: p.chips,
          seat: p.seat,
          connected: p.connected,
          hand: isSelf && p.hand ? p.hand : null,
          handHidden: !isSelf && !!p.hand,
          turnStatus: this.turnStatusFor(game, p),
        };
      }),
      round,
    };

    if (viewerId) {
      const self = game.players.find((p) => p.id === viewerId);
      const isOwner = game.ownerId === viewerId;
      const isBettor =
        !!game.round &&
        this.playerAtSeat(game, game.round.bettorSeat).id === viewerId;
      const handHasBetween =
        !!self?.hand && hasBetween(self.hand[0], self.hand[1]);
      const turnOpen =
        isBettor &&
        game.status === 'playing' &&
        game.round?.phase === 'awaiting_bet';
      publicGame.you = {
        id: viewerId,
        isOwner,
        isBettor,
        canBet: turnOpen && handHasBetween,
        canSkip: turnOpen,
        canStart:
          isOwner &&
          game.status === 'lobby' &&
          game.players.length >= game.minPlayers,
        canEnd: isOwner && game.status === 'playing',
        hand: self?.hand ?? null,
      };
    }

    return publicGame;
  }
}
