import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { UsersService } from '../users/users.service';
import { GameService } from './game.service';

type AuthSocket = Socket & {
  userId?: string;
  userName?: string;
  userPicture?: string;
};

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private revealTimers = new Map<string, NodeJS.Timeout>();
  private turnTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly games: GameService,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async handleConnection(client: AuthSocket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers.authorization || '').replace('Bearer ', '');
      if (!token) {
        client.emit('error', { message: 'Unauthorized' });
        client.disconnect();
        return;
      }
      const payload = this.jwt.verify<{
        sub: string;
        email?: string;
        name?: string;
        provider?: 'google' | 'dev';
      }>(token);
      let user = await this.users.findById(payload.sub);
      if (!user && payload.email) {
        user = await this.users.restoreFromClaims({
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          provider: payload.provider,
        });
      }
      if (!user) {
        client.emit('error', { message: 'Unauthorized' });
        client.disconnect();
        return;
      }
      client.userId = user.id;
      client.userName = user.name;
      client.userPicture = user.picture;

      const state = await this.games.attachSocket(user.id, client.id);
      if (state) {
        client.join(state.code);
        client.emit('game:state', state);
        this.broadcast(state.code);
        this.armTurnTimer(state.code);
      } else {
        client.emit('lobby:ready', { ok: true });
      }
    } catch {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthSocket) {
    if (!client.userId) return;
    const state = await this.games.detachSocket(client.userId, client.id);
    if (state) {
      this.broadcast(state.code);
    }
  }

  @SubscribeMessage('game:create')
  async onCreate(@ConnectedSocket() client: AuthSocket) {
    if (!client.userId) return { error: 'Unauthorized' };
    try {
      const state = await this.games.createGame({
        id: client.userId,
        name: client.userName || 'Player',
        picture: client.userPicture,
      });
      client.join(state.code);
      this.broadcast(state.code);
      return { ok: true, game: state };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  @SubscribeMessage('game:join')
  async onJoin(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { code: string },
  ) {
    if (!client.userId) return { error: 'Unauthorized' };
    try {
      const state = await this.games.joinGame(body.code, {
        id: client.userId,
        name: client.userName || 'Player',
        picture: client.userPicture,
      });
      client.join(state.code);
      this.broadcast(state.code);
      this.armTurnTimer(state.code);
      return { ok: true, game: state };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  @SubscribeMessage('game:leave')
  async onLeave(@ConnectedSocket() client: AuthSocket) {
    if (!client.userId) return { error: 'Unauthorized' };
    const previousCode = this.games.getPublicForPlayer(client.userId)?.code;
    const state = await this.games.leaveGame(client.userId);
    const code = state?.code || previousCode;
    if (code) {
      client.leave(code);
      if (state) this.broadcast(code);
    }
    return { ok: true, left: true };
  }

  @SubscribeMessage('game:start')
  async onStart(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { code: string },
  ) {
    if (!client.userId) return { error: 'Unauthorized' };
    try {
      const state = await this.games.startGame(body.code, client.userId);
      this.broadcast(state.code);
      this.armTurnTimer(state.code);
      return { ok: true, game: state };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  @SubscribeMessage('game:end')
  async onEnd(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { code: string },
  ) {
    if (!client.userId) return { error: 'Unauthorized' };
    try {
      this.clearRevealTimer(body.code);
      this.clearTurnTimer(body.code);
      const state = await this.games.endGame(body.code, client.userId);
      this.broadcast(state.code);
      return { ok: true, game: state };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  @SubscribeMessage('game:bet')
  async onBet(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { code: string; amount: number },
  ) {
    if (!client.userId) return { error: 'Unauthorized' };
    try {
      this.clearTurnTimer(body.code);
      const result = await this.games.placeBet(
        body.code,
        client.userId,
        body.amount,
      );
      this.broadcast(result.public.code);
      this.clearRevealTimer(result.public.code);
      this.revealTimers.set(
        result.public.code,
        setTimeout(() => {
          void result.next().then((next) => {
            this.broadcast(next.code);
            this.armTurnTimer(next.code);
          });
        }, result.delayMs),
      );
      return { ok: true };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  @SubscribeMessage('game:skip')
  async onSkip(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { code: string },
  ) {
    if (!client.userId) return { error: 'Unauthorized' };
    try {
      this.clearTurnTimer(body.code);
      const state = await this.games.skipBet(body.code, client.userId);
      this.broadcast(state.code);
      this.armTurnTimer(state.code);
      return { ok: true };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  @SubscribeMessage('game:sync')
  onSync(@ConnectedSocket() client: AuthSocket) {
    if (!client.userId) return { error: 'Unauthorized' };
    const state = this.games.getPublicForPlayer(client.userId);
    if (state) {
      client.join(state.code);
      this.armTurnTimer(state.code);
      return { ok: true, game: state };
    }
    return { ok: true, game: null };
  }

  private armTurnTimer(code: string) {
    this.clearTurnTimer(code);
    const remaining = this.games.turnMsRemaining(code);
    if (remaining == null) return;

    this.turnTimers.set(
      code,
      setTimeout(() => {
        void (async () => {
          try {
            const state = await this.games.autoSkipTurn(code);
            this.broadcast(state.code);
            this.armTurnTimer(state.code);
          } catch {
            // Game may have ended or changed phase
          }
        })();
      }, remaining),
    );
  }

  private broadcast(code: string) {
    const room = this.server.sockets.adapter.rooms.get(code);
    if (!room) return;
    for (const socketId of room) {
      const sock = this.server.sockets.sockets.get(socketId) as
        | AuthSocket
        | undefined;
      if (!sock?.userId) continue;
      const personalized = this.games.getPublicForPlayer(sock.userId);
      if (personalized && personalized.code === code) {
        sock.emit('game:state', personalized);
      } else {
        sock.emit('game:state', this.games.getGameByCode(code, sock.userId));
      }
    }
  }

  private clearRevealTimer(code: string) {
    const t = this.revealTimers.get(code);
    if (t) {
      clearTimeout(t);
      this.revealTimers.delete(code);
    }
  }

  private clearTurnTimer(code: string) {
    const t = this.turnTimers.get(code);
    if (t) {
      clearTimeout(t);
      this.turnTimers.delete(code);
    }
  }
}
