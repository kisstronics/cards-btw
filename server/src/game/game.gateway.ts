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

  private timers = new Map<string, NodeJS.Timeout>();

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
      const payload = this.jwt.verify<{ sub: string; name?: string }>(token);
      const user = this.users.findById(payload.sub);
      if (!user) {
        client.emit('error', { message: 'Unauthorized' });
        client.disconnect();
        return;
      }
      client.userId = user.id;
      client.userName = user.name;
      client.userPicture = user.picture;

      const state = this.games.attachSocket(user.id, client.id);
      if (state) {
        client.join(state.code);
        client.emit('game:state', state);
        this.broadcast(state.code);
      } else {
        client.emit('lobby:ready', { ok: true });
      }
    } catch {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthSocket) {
    if (!client.userId) return;
    const state = this.games.detachSocket(client.userId, client.id);
    if (state) {
      this.broadcast(state.code);
    }
  }

  @SubscribeMessage('game:create')
  onCreate(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { buyIn?: number },
  ) {
    if (!client.userId) return { error: 'Unauthorized' };
    try {
      const state = this.games.createGame(
        {
          id: client.userId,
          name: client.userName || 'Player',
          picture: client.userPicture,
        },
        body?.buyIn,
      );
      client.join(state.code);
      this.broadcast(state.code);
      return { ok: true, game: state };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  @SubscribeMessage('game:join')
  onJoin(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { code: string },
  ) {
    if (!client.userId) return { error: 'Unauthorized' };
    try {
      const state = this.games.joinGame(body.code, {
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

  @SubscribeMessage('game:leave')
  onLeave(@ConnectedSocket() client: AuthSocket) {
    if (!client.userId) return { error: 'Unauthorized' };
    const state = this.games.leaveGame(client.userId);
    if (state) {
      client.leave(state.code);
      this.broadcast(state.code);
    }
    return { ok: true };
  }

  @SubscribeMessage('game:start')
  onStart(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { code: string },
  ) {
    if (!client.userId) return { error: 'Unauthorized' };
    try {
      const state = this.games.startGame(body.code, client.userId);
      this.broadcast(state.code);
      return { ok: true, game: state };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  @SubscribeMessage('game:end')
  onEnd(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { code: string },
  ) {
    if (!client.userId) return { error: 'Unauthorized' };
    try {
      this.clearTimer(body.code);
      const state = this.games.endGame(body.code, client.userId);
      this.broadcast(state.code);
      return { ok: true, game: state };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  @SubscribeMessage('game:bet')
  onBet(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { code: string; amount: number },
  ) {
    if (!client.userId) return { error: 'Unauthorized' };
    try {
      const result = this.games.placeBet(body.code, client.userId, body.amount);
      this.broadcast(result.public.code);
      this.clearTimer(result.public.code);
      this.timers.set(
        result.public.code,
        setTimeout(() => {
          const next = result.next();
          this.broadcast(next.code);
        }, result.delayMs),
      );
      return { ok: true };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  @SubscribeMessage('game:skip')
  onSkip(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { code: string },
  ) {
    if (!client.userId) return { error: 'Unauthorized' };
    try {
      const state = this.games.skipBet(body.code, client.userId);
      this.broadcast(state.code);
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
      return { ok: true, game: state };
    }
    return { ok: true, game: null };
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

  private clearTimer(code: string) {
    const t = this.timers.get(code);
    if (t) {
      clearTimeout(t);
      this.timers.delete(code);
    }
  }
}
