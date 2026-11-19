import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type QueryResultRow } from 'pg';
import type { Card } from '../game/cards';
import type {
  GameStatus,
  InternalGame,
  InternalPlayer,
  InternalRound,
} from '../game/game.types';
import type { User } from '../users/user.types';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | null = null;

  constructor(private readonly config: ConfigService) {}

  get enabled() {
    return Boolean(this.pool);
  }

  async onModuleInit() {
    const connectionString = this.config.get<string>('DATABASE_URL')?.trim();
    if (!connectionString) {
      this.logger.warn('DATABASE_URL not set — running without persistence');
      return;
    }

    this.pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 8,
    });

    try {
      await this.pool.query('SELECT 1');
      await this.migrate();
      this.logger.log('PostgreSQL connected and schema ready');
    } catch (err) {
      this.logger.error(
        `PostgreSQL connection failed: ${(err as Error).message}`,
      );
      await this.pool.end().catch(() => undefined);
      this.pool = null;
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  private async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) {
    if (!this.pool) {
      throw new Error('Database is not available');
    }
    return this.pool.query<T>(text, params);
  }

  private async migrate() {
    await this.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        picture TEXT,
        provider TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS games (
        code TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        owner_id UUID REFERENCES users(id),
        pot INT NOT NULL DEFAULT 0,
        buy_in INT NOT NULL DEFAULT 0,
        deck JSONB NOT NULL DEFAULT '[]'::jsonb,
        round JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS game_players (
        id SERIAL PRIMARY KEY,
        game_code TEXT NOT NULL REFERENCES games(code) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        seat INT NOT NULL,
        chips INT NOT NULL DEFAULT 0,
        starting_chips INT NOT NULL DEFAULT 0,
        connected BOOLEAN NOT NULL DEFAULT TRUE,
        hand JSONB,
        acted_this_orbit BOOLEAN NOT NULL DEFAULT FALSE,
        UNIQUE (game_code, user_id)
      );

      CREATE TABLE IF NOT EXISTS game_actions (
        id SERIAL PRIMARY KEY,
        game_code TEXT NOT NULL REFERENCES games(code) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id),
        action TEXT NOT NULL,
        amount INT NOT NULL DEFAULT 0,
        pot_after INT,
        chips_after INT,
        message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS game_scores (
        id SERIAL PRIMARY KEY,
        game_code TEXT NOT NULL REFERENCES games(code) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        final_chips INT NOT NULL,
        rank INT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (game_code, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players(user_id);
      CREATE INDEX IF NOT EXISTS idx_game_actions_game ON game_actions(game_code);
      CREATE INDEX IF NOT EXISTS idx_game_scores_user ON game_scores(user_id);
      CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
    `);

    // Additive column for older databases
    await this.query(`
      ALTER TABLE game_players
      ADD COLUMN IF NOT EXISTS rounds_played INT NOT NULL DEFAULT 0
    `);
  }

  async upsertUser(user: User): Promise<User> {
    if (!this.enabled) return user;
    const result = await this.query<{
      id: string;
      email: string;
      name: string;
      picture: string | null;
      provider: User['provider'];
    }>(
      `INSERT INTO users (id, email, name, picture, provider)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         picture = COALESCE(EXCLUDED.picture, users.picture),
         provider = EXCLUDED.provider,
         updated_at = NOW()
       RETURNING id, email, name, picture, provider`,
      [user.id, user.email, user.name, user.picture ?? null, user.provider],
    );
    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      picture: row.picture || undefined,
      provider: row.provider,
    };
  }

  async findUserById(id: string): Promise<User | null> {
    if (!this.enabled) return null;
    const result = await this.query<{
      id: string;
      email: string;
      name: string;
      picture: string | null;
      provider: User['provider'];
    }>(
      `SELECT id, email, name, picture, provider FROM users WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      picture: row.picture || undefined,
      provider: row.provider,
    };
  }

  async findUserByEmail(email: string): Promise<User | null> {
    if (!this.enabled) return null;
    const result = await this.query<{
      id: string;
      email: string;
      name: string;
      picture: string | null;
      provider: User['provider'];
    }>(
      `SELECT id, email, name, picture, provider FROM users WHERE email = $1`,
      [email],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      picture: row.picture || undefined,
      provider: row.provider,
    };
  }

  async saveGame(game: InternalGame) {
    if (!this.enabled) return;
    await this.query(
      `INSERT INTO games (code, status, owner_id, pot, buy_in, deck, round, created_at, started_at, ended_at, updated_at)
       VALUES (
         $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb,
         to_timestamp($8 / 1000.0),
         CASE WHEN $9::bigint IS NULL THEN NULL ELSE to_timestamp($9 / 1000.0) END,
         CASE WHEN $10::bigint IS NULL THEN NULL ELSE to_timestamp($10 / 1000.0) END,
         NOW()
       )
       ON CONFLICT (code) DO UPDATE SET
         status = EXCLUDED.status,
         owner_id = EXCLUDED.owner_id,
         pot = EXCLUDED.pot,
         buy_in = EXCLUDED.buy_in,
         deck = EXCLUDED.deck,
         round = EXCLUDED.round,
         started_at = COALESCE(games.started_at, EXCLUDED.started_at),
         ended_at = COALESCE(games.ended_at, EXCLUDED.ended_at),
         updated_at = NOW()`,
      [
        game.code,
        game.status,
        game.ownerId,
        game.pot,
        game.buyIn,
        JSON.stringify(game.deck),
        game.round ? JSON.stringify(game.round) : null,
        game.createdAt,
        game.startedAt,
        game.endedAt,
      ],
    );

    for (const player of game.players) {
      await this.query(
        `INSERT INTO game_players
           (game_code, user_id, seat, chips, starting_chips, connected, hand, acted_this_orbit, rounds_played)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
         ON CONFLICT (game_code, user_id) DO UPDATE SET
           seat = EXCLUDED.seat,
           chips = EXCLUDED.chips,
           connected = EXCLUDED.connected,
           hand = EXCLUDED.hand,
           acted_this_orbit = EXCLUDED.acted_this_orbit,
           rounds_played = EXCLUDED.rounds_played`,
        [
          game.code,
          player.id,
          player.seat,
          player.chips,
          game.buyIn,
          player.connected,
          player.hand ? JSON.stringify(player.hand) : null,
          player.actedThisOrbit,
          player.roundsPlayed ?? 0,
        ],
      );
    }

    // Drop seats no longer in the lobby game
    if (game.status === 'lobby' && game.players.length > 0) {
      await this.query(
        `DELETE FROM game_players
         WHERE game_code = $1
           AND user_id <> ALL($2::uuid[])`,
        [game.code, game.players.map((p) => p.id)],
      );
    }
  }

  async deleteGame(code: string) {
    if (!this.enabled) return;
    await this.query(`DELETE FROM games WHERE code = $1`, [code]);
  }

  async recordAction(params: {
    gameCode: string;
    userId?: string;
    action: string;
    amount?: number;
    potAfter?: number;
    chipsAfter?: number;
    message?: string;
  }) {
    if (!this.enabled) return;
    await this.query(
      `INSERT INTO game_actions
         (game_code, user_id, action, amount, pot_after, chips_after, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        params.gameCode,
        params.userId ?? null,
        params.action,
        params.amount ?? 0,
        params.potAfter ?? null,
        params.chipsAfter ?? null,
        params.message ?? null,
      ],
    );
  }

  async saveScores(game: InternalGame) {
    if (!this.enabled) return;
    const ranked = [...game.players].sort((a, b) => b.chips - a.chips);
    for (let i = 0; i < ranked.length; i += 1) {
      const player = ranked[i];
      await this.query(
        `INSERT INTO game_scores (game_code, user_id, final_chips, rank)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (game_code, user_id) DO UPDATE SET
           final_chips = EXCLUDED.final_chips,
           rank = EXCLUDED.rank`,
        [game.code, player.id, player.chips, i + 1],
      );
    }
  }

  async loadActiveGames(): Promise<InternalGame[]> {
    if (!this.enabled) return [];
    const gamesResult = await this.query<{
      code: string;
      status: GameStatus;
      owner_id: string;
      pot: number;
      buy_in: number;
      deck: Card[];
      round: InternalRound | null;
      created_at: Date;
      started_at: Date | null;
      ended_at: Date | null;
    }>(
      `SELECT code, status, owner_id, pot, buy_in, deck, round, created_at, started_at, ended_at
       FROM games
       WHERE status IN ('lobby', 'playing')`,
    );

    const games: InternalGame[] = [];
    for (const row of gamesResult.rows) {
      const playersResult = await this.query<{
        user_id: string;
        name: string;
        picture: string | null;
        seat: number;
        chips: number;
        connected: boolean;
        hand: [Card, Card] | null;
        acted_this_orbit: boolean;
        rounds_played: number;
      }>(
        `SELECT gp.user_id, u.name, u.picture, gp.seat, gp.chips, gp.connected,
                gp.hand, gp.acted_this_orbit, COALESCE(gp.rounds_played, 0) AS rounds_played
         FROM game_players gp
         JOIN users u ON u.id = gp.user_id
         WHERE gp.game_code = $1
         ORDER BY gp.seat ASC`,
        [row.code],
      );

      const players: InternalPlayer[] = playersResult.rows.map((p) => ({
        id: p.user_id,
        name: p.name,
        picture: p.picture || undefined,
        chips: p.chips,
        seat: p.seat,
        connected: false,
        socketIds: new Set(),
        hand: p.hand,
        actedThisOrbit: p.acted_this_orbit,
        roundsPlayed: Number(p.rounds_played) || 0,
      }));

      games.push({
        code: row.code,
        status: row.status,
        ownerId: row.owner_id,
        minPlayers: 2,
        maxPlayers: 6,
        buyIn: row.buy_in,
        pot: row.pot,
        deck: Array.isArray(row.deck) ? row.deck : [],
        players,
        round: row.round,
        createdAt: new Date(row.created_at).getTime(),
        startedAt: row.started_at
          ? new Date(row.started_at).getTime()
          : null,
        endedAt: row.ended_at ? new Date(row.ended_at).getTime() : null,
      });
    }
    return games;
  }

  /** Games where the user is owner or a seated player — never a public listing. */
  async listRecentGamesForUser(viewerId: string, limit = 30) {
    if (!this.enabled) return [];
    const result = await this.query<{
      code: string;
      status: string;
      pot: number;
      created_at: Date;
      started_at: Date | null;
      ended_at: Date | null;
      owner_name: string | null;
      player_count: string;
    }>(
      `SELECT g.code, g.status, g.pot, g.created_at, g.started_at, g.ended_at,
              u.name AS owner_name,
              (SELECT COUNT(*)::text FROM game_players gp WHERE gp.game_code = g.code) AS player_count
       FROM games g
       LEFT JOIN users u ON u.id = g.owner_id
       WHERE g.owner_id = $1
          OR EXISTS (
            SELECT 1 FROM game_players gp
            WHERE gp.game_code = g.code AND gp.user_id = $1
          )
       ORDER BY COALESCE(g.ended_at, g.updated_at, g.created_at) DESC
       LIMIT $2`,
      [viewerId, limit],
    );

    const games: Array<{
      code: string;
      status: string;
      playerCount: number;
      maxPlayers: number;
      pot: number;
      ownerName: string;
      createdAt: number;
      startedAt: number | null;
      endedAt: number | null;
      joinable: boolean;
      canRejoin: boolean;
      players: Array<{
        id: string;
        name: string;
        score: number;
        roundsPlayed: number;
      }>;
    }> = [];
    for (const r of result.rows) {
      const players = await this.getGamePlayerStats(r.code);
      const canRejoin = r.status === 'playing';
      games.push({
        code: r.code,
        status: r.status,
        playerCount: Number(r.player_count) || players.length,
        maxPlayers: 6,
        pot: r.pot,
        ownerName: r.owner_name || 'Host',
        createdAt: new Date(r.created_at).getTime(),
        startedAt: r.started_at ? new Date(r.started_at).getTime() : null,
        endedAt: r.ended_at ? new Date(r.ended_at).getTime() : null,
        joinable: r.status === 'lobby' || r.status === 'playing',
        canRejoin,
        players,
      });
    }
    return games;
  }

  async getGamePlayerStats(gameCode: string) {
    if (!this.enabled) return [];
    const result = await this.query<{
      user_id: string;
      name: string;
      chips: number;
      rounds_played: number;
      action_rounds: string;
      final_chips: number | null;
    }>(
      `SELECT gp.user_id, u.name, gp.chips,
              COALESCE(gp.rounds_played, 0) AS rounds_played,
              (
                SELECT COUNT(*)::text FROM game_actions ga
                WHERE ga.game_code = gp.game_code
                  AND ga.user_id = gp.user_id
                  AND ga.action IN ('bet_win', 'bet_lose', 'skip')
              ) AS action_rounds,
              gs.final_chips
       FROM game_players gp
       JOIN users u ON u.id = gp.user_id
       LEFT JOIN game_scores gs
         ON gs.game_code = gp.game_code AND gs.user_id = gp.user_id
       WHERE gp.game_code = $1
       ORDER BY COALESCE(gs.final_chips, gp.chips) DESC, gp.seat ASC`,
      [gameCode],
    );
    return result.rows.map((p) => {
      const fromColumn = Number(p.rounds_played) || 0;
      const fromActions = Number(p.action_rounds) || 0;
      return {
        id: p.user_id,
        name: p.name,
        score: p.final_chips ?? p.chips,
        roundsPlayed: Math.max(fromColumn, fromActions),
      };
    });
  }

  async getUserScores(userId: string, limit = 20) {
    if (!this.enabled) return [];
    const result = await this.query<{
      game_code: string;
      final_chips: number;
      rank: number;
      status: string;
      ended_at: Date | null;
      created_at: Date;
    }>(
      `SELECT gs.game_code, gs.final_chips, gs.rank, g.status, g.ended_at, gs.created_at
       FROM game_scores gs
       JOIN games g ON g.code = gs.game_code
       WHERE gs.user_id = $1
       ORDER BY gs.created_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    return result.rows.map((r) => ({
      gameCode: r.game_code,
      finalChips: r.final_chips,
      rank: r.rank,
      status: r.status,
      endedAt: r.ended_at,
      createdAt: r.created_at,
    }));
  }
}
