export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  provider: 'google' | 'dev';
}

export type GameStatus = 'lobby' | 'playing' | 'ended';
export type RoundPhase =
  | 'idle'
  | 'awaiting_bet'
  | 'revealing'
  | 'resolved'
  | 'no_between';

export type PlayerTurnStatus = 'betting' | 'waiting' | 'done' | 'idle';

export interface Card {
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  rank: string;
  value: number;
}

export interface PlayerPublic {
  id: string;
  name: string;
  picture?: string;
  chips: number;
  seat: number;
  connected: boolean;
  hand: [Card, Card] | null;
  handHidden: boolean;
  turnStatus: PlayerTurnStatus;
}

export interface RoundPublic {
  dealerSeat: number;
  bettorSeat: number;
  thirdCard: Card | null;
  phase: RoundPhase;
  /** Epoch ms when the current bettor's turn expires (auto-skip). */
  turnDeadlineAt?: number | null;
  lastResult?: {
    bettorId: string;
    bettorName: string;
    amount: number;
    won: boolean;
    message: string;
  };
}

export interface GamePublic {
  code: string;
  status: GameStatus;
  gameType: 'between';
  ownerId: string;
  minPlayers: number;
  maxPlayers: number;
  buyIn: number;
  pot: number;
  deckRemaining: number;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  players: PlayerPublic[];
  round: RoundPublic | null;
  you?: {
    id: string;
    isOwner: boolean;
    isBettor: boolean;
    canBet: boolean;
    canSkip: boolean;
    canStart: boolean;
    canEnd: boolean;
    hand: [Card, Card] | null;
  };
}
