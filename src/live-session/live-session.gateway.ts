import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../auth/ws-jwt/ws-jwt.guard';
import { RedisService } from '../redis/redis.service';

@WebSocketGateway({
  namespace: 'live-session',
  cors: {
    origin: '*',
  },
})
export class LiveSessionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LiveSessionGateway.name);

  constructor(private readonly redisService: RedisService) {}

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected to live-session: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from live-session: ${client.id}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join-room')
  handleJoinRoom(client: Socket, roomId: string) {
    client.join(`room:${roomId}`);
    this.logger.log(`Client ${client.id} joined room ${roomId} realtime updates`);
    return { event: 'joined-room', data: roomId };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leave-room')
  handleLeaveRoom(client: Socket, roomId: string) {
    client.leave(`room:${roomId}`);
    this.logger.log(`Client ${client.id} left room ${roomId} realtime updates`);
    return { event: 'left-room', data: roomId };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join-session')
  handleJoinSession(client: Socket, sessionId: string) {
    client.join(`session:${sessionId}`);
    this.logger.log(`Client ${client.id} joined session ${sessionId} realtime updates`);
    return { event: 'joined-session', data: sessionId };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leave-session')
  handleLeaveSession(client: Socket, sessionId: string) {
    client.leave(`session:${sessionId}`);
    this.logger.log(`Client ${client.id} left session ${sessionId} realtime updates`);
    return { event: 'left-session', data: sessionId };
  }

  async broadcastSessionEvent(roomId: string, eventType: string, data: any) {
    this.server.to(`room:${roomId}`).emit(eventType, data);
    this.logger.log(`Broadcasted ${eventType} to room ${roomId}`);
  }

  async broadcastToSession(sessionId: string, eventType: string, data: any) {
    this.server.to(`session:${sessionId}`).emit(eventType, data);
    this.logger.log(`Broadcasted ${eventType} to session ${sessionId}`);
  }
}
