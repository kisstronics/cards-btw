import { io, Socket } from 'socket.io-client';
import { getToken } from './api';
import type { GamePublic } from './types';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3002';

let socket: Socket | null = null;

export function connectSocket() {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  if (socket?.connected) return socket;

  socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export type GameAck = { ok?: boolean; error?: string; game?: GamePublic };
