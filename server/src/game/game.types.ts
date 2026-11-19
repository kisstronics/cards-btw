import { Card } from './cards';

export type GameStatus = 'lobby' | 'playing' | 'ended';
export type RoundPhase =
  | 'idle'
  | 'awaiting_bet'
  | 'revealing'
  | 'resolved'
  | 'no_between';

export type PlayerTurnStatus = 'betting' | 'waiting' | 'done' | 'idle';

export interface PlayerPublic {
  id: string;
  name: string;
  picture?: string;
  chips: number;
  seat: number;
  connected: boolean;
  /** Only filled for the viewer; others get nulls / face-down flags. */
  hand: [Card, Card] | null;
  handHidden: boolean;
  turnStatus: PlayerTurnStatus;
}

export interface RoundPublic {
  dealerSeat: number;
  bettorSeat: number;
  thirdCard: Card | null;
  phase: RoundPhase;
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

export interface InternalPlayer {
  id: string;
  name: string;
  picture?: string;
  chips: number;
  seat: number;
  connected: boolean;
  socketIds: Set<string>;
  hand: [Card, Card] | null;
  /** Players who already acted this orbit (bet resolved or skipped). */
  actedThisOrbit: boolean;
}

export interface InternalRound {
  dealerSeat: number;
  bettorSeat: number;
  thirdCard: Card | null;
  phase: RoundPhase;
  lastResult?: RoundPublic['lastResult'];
}

export interface InternalGame {
  code: string;
  status: GameStatus;
  ownerId: string;
  minPlayers: number;
  maxPlayers: number;
  buyIn: number;
  pot: number;
  deck: Card[];
  players: InternalPlayer[];
  round: InternalRound | null;
  createdAt: number;
}
