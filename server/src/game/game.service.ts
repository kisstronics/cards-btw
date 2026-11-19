import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  InternalRound,
  PlayerTurnStatus,
} from './game.types';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const DEFAULT_BUY_IN = 100;
/** Each player antes this much onto the board at start and whenever the board hits 0. */
const ANTE = 10;
const DEFAULT_BET = 10;
const MIN_BET = 5;
const MAX_BET = 50;

function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

@Injectable()
export class GameService {
  private games = new Map<string, InternalGame>();
  private playerToGame = new Map<string, string>();

  createGame(
    owner: { id: string; name: string; picture?: string },
    buyIn = DEFAULT_BUY_IN,
  ) {
    this.leaveAnyGame(owner.id);

    let code = generateCode();
    while (this.games.has(code)) {
      code = generateCode();
    }

    const chips = Math.max(20, Math.min(buyIn, 1000));
    const game: InternalGame = {
      code,
      status: 'lobby',
      ownerId: owner.id,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      buyIn: chips,
      pot: 0,
      deck: [],
      players: [
        {
          id: owner.id,
          name: owner.name,
          picture: owner.picture,
          chips,
          seat: 0,
          connected: true,
          socketIds: new Set(),
          hand: null,
          actedThisOrbit: false,
        },
      ],
      round: null,
      createdAt: Date.now(),
    };

    this.games.set(code, game);
    this.playerToGame.set(owner.id, code);
    return this.toPublic(game, owner.id);
  }

  joinGame(
    code: string,
    player: { id: string; name: string; picture?: string },
  ) {
    const game = this.requireGame(code.toUpperCase());
    if (game.status !== 'lobby') {
      throw new BadRequestException('Game already started');
    }
    if (game.players.length >= game.maxPlayers) {
      throw new BadRequestException('Game is full');
    }

    const existing = game.players.find((p) => p.id === player.id);
    if (existing) {
      existing.connected = true;
      this.playerToGame.set(player.id, game.code);
      return this.toPublic(game, player.id);
    }

    this.leaveAnyGame(player.id);

    game.players.push({
      id: player.id,
      name: player.name,
      picture: player.picture,
      chips: game.buyIn,
      seat: game.players.length,
      connected: true,
      socketIds: new Set(),
      hand: null,
      actedThisOrbit: false,
    });
    this.playerToGame.set(player.id, game.code);
    return this.toPublic(game, player.id);
  }

  leaveGame(playerId: string) {
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
        return null;
      }
      if (game.ownerId === playerId) {
        game.ownerId = game.players[0].id;
      }
      game.players.forEach((p, i) => {
        p.seat = i;
      });
      return this.toPublic(game);
    }

    const player = game.players.find((p) => p.id === playerId);
    if (player) {
      player.connected = false;
      player.socketIds.clear();
    }
    return this.toPublic(game);
  }

  attachSocket(playerId: string, socketId: string) {
    const game = this.getGameForPlayer(playerId);
    if (!game) return null;
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return null;
    player.socketIds.add(socketId);
    player.connected = true;
    return this.toPublic(game, playerId);
  }

  detachSocket(playerId: string, socketId: string) {
    const game = this.getGameForPlayer(playerId);
    if (!game) return null;
    const player = game.players.find((p) => p.id === playerId);
    if (!player) return null;
    player.socketIds.delete(socketId);
    if (player.socketIds.size === 0) {
      player.connected = false;
    }
    return this.toPublic(game);
  }

  startGame(code: string, requesterId: string) {
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
      chips: game.buyIn,
      hand: null,
      actedThisOrbit: false,
    }));
    game.pot = 0;
    game.deck = shuffle(createDeck());
    game.status = 'playing';
    this.collectAnte(game);
    this.beginOrbit(game, 0);
    return this.toPublic(game, requesterId);
  }

  endGame(code: string, requesterId: string) {
    const game = this.requireGame(code);
    if (game.ownerId !== requesterId) {
      throw new ForbiddenException('Only the owner can end the game');
    }
    game.status = 'ended';
    game.round = null;
    game.players.forEach((p) => {
      p.hand = null;
      p.actedThisOrbit = false;
    });
    return this.toPublic(game, requesterId);
  }

  placeBet(code: string, playerId: string, amount: number) {
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
    const maxBet = Math.min(MAX_BET, game.pot, bettor.chips);
    const minBet = Math.min(MIN_BET, maxBet);
    if (bet < minBet || bet > maxBet) {
      throw new BadRequestException(
        `Bet must be between ${minBet} and ${maxBet} (cannot exceed board)`,
      );
    }

    round.phase = 'revealing';
    const third = this.draw(game);
    round.thirdCard = third;

    const won = isBetween(third, bettor.hand[0], bettor.hand[1]);
    if (won) {
      // Win: take the bet from the board
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
      // Lose: chips go onto the board
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
    round.phase = 'resolved';

    const clearedBoard = won && game.pot === 0;
    const clearerSeat = bettor.seat;

    return {
      public: this.toPublic(game, playerId),
      delayMs: 1800,
      next: () => {
        if (clearedBoard) {
          // Clearer serves the next deal; next seat picks first.
          this.collectAnte(game);
          this.beginOrbit(game, clearerSeat);
        } else {
          this.advanceToNextBettor(game);
        }
        return this.toPublic(game);
      },
    };
  }

  skipBet(code: string, playerId: string) {
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

    bettor.actedThisOrbit = true;
    round.lastResult = {
      bettorId: bettor.id,
      bettorName: bettor.name,
      amount: 0,
      won: false,
      message: `${bettor.name} skipped`,
    };

    this.advanceToNextBettor(game);
    return this.toPublic(game, playerId);
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
    return { min: MIN_BET, max: MAX_BET, default: DEFAULT_BET, ante: ANTE };
  }

  private leaveAnyGame(playerId: string) {
    if (this.playerToGame.get(playerId)) {
      this.leaveGame(playerId);
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

  /** Each player puts ANTE onto the board. */
  private collectAnte(game: InternalGame) {
    for (const player of game.players) {
      const put = Math.min(ANTE, player.chips);
      player.chips -= put;
      game.pot += put;
    }
  }

  /** Drop all hands and deal 2 private cards; dealer serves, next seat picks. */
  private beginOrbit(game: InternalGame, dealerSeat: number) {
    if (game.pot <= 0) {
      this.collectAnte(game);
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
    };
  }

  private openBettorTurn(game: InternalGame, bettorSeat: number) {
    game.round!.bettorSeat = bettorSeat;
    game.round!.thirdCard = null;
    game.round!.phase = 'awaiting_bet';
  }

  /**
   * After a skip or failed bet, give the next player a turn.
   * When everyone has acted (all skip/fail, or finished the deal), serve new cards.
   */
  private advanceToNextBettor(game: InternalGame) {
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

    // Everyone skipped or failed this deal → new cards; next dealer serves
    const nextDealer = (game.round.dealerSeat + 1) % n;
    this.beginOrbit(game, nextDealer);
  }

  private turnStatusFor(
    game: InternalGame,
    player: InternalPlayer,
  ): PlayerTurnStatus {
    if (game.status !== 'playing' || !game.round) return 'idle';
    if (player.seat === game.round.bettorSeat) return 'betting';
    if (player.actedThisOrbit) return 'done';
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
