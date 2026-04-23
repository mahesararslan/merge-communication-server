import {
  UseGuards,
  UsePipes,
  ValidationPipe,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { WsJwtGuard } from '../auth/ws-jwt/ws-jwt.guard';
import { SocketAuthMiddleware } from '../auth/ws.mw';
import { AskQuestionDto } from './dto/ask-question.dto';
import { VoteQuestionDto } from './dto/vote-question.dto';
import { UpdateQuestionStatusDto } from './dto/update-question-status.dto';
import { JoinSessionDto } from './dto/join-session.dto';
import {
  LiveQnaEvents,
  LiveQnaRedisPayload,
  LiveQnaQuestion,
  LiveQnaQuestionStatus,
  WebSocketResponse,
} from './types/live-qna.type';

@WebSocketGateway({
  namespace: 'live-qna',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
@UseGuards(WsJwtGuard)
export class LiveQnaGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server<any, LiveQnaEvents>;

  private readonly logger = new Logger(LiveQnaGateway.name);
  private backendUrl: string;
  private userSockets: Map<string, Set<string>> = new Map();
  private sessionMembers: Map<string, Set<string>> = new Map();

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.backendUrl = this.configService.get<string>(
      'BACKEND_URL',
      'http://localhost:3000',
    );
    this.logger.log(`LiveQnaGateway configured with backendUrl=${this.backendUrl}`);
  }

  async onModuleInit() {
    try {
      await this.redisService.subscribe(
        'live-qna',
        this.handleRedisMessage.bind(this),
      );
      this.logger.log('Subscribed to Redis live-qna channel');
    } catch (error) {
      this.logger.error('Failed to subscribe to Redis live-qna channel', error);
    }
  }

  afterInit(server: Server) {
    server.use(SocketAuthMiddleware() as any);
    this.logger.log('Live Q&A gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const userId = (client as any).user?.userId;

      if (!userId) {
        this.logger.warn('Client connected without user info');
        client.disconnect();
        return;
      }

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      client.join(`user:${userId}`);
      this.logger.log(`Client ${client.id} connected for user ${userId}`);
    } catch (error) {
      this.logger.error('Error handling connection:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client as any).user?.userId;
    if (!userId) return;

    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }

    this.sessionMembers.forEach((members, sessionKey) => {
      if (members.has(userId)) {
        members.delete(userId);
        if (members.size === 0) {
          this.sessionMembers.delete(sessionKey);
        }
      }
      client.leave(sessionKey);
    });

    this.logger.log(`Client ${client.id} disconnected for user ${userId}`);
  }

  @SubscribeMessage('joinSession')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinSessionDto,
  ): Promise<WebSocketResponse> {
    const userId = (client as any).user?.userId;
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    const sessionKey = this.buildSessionKey(data.roomId, data.sessionId);
    client.join(sessionKey);

    if (!this.sessionMembers.has(sessionKey)) {
      this.sessionMembers.set(sessionKey, new Set());
    }
    this.sessionMembers.get(sessionKey)!.add(userId);

    return { success: true };
  }

  @SubscribeMessage('leaveSession')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async handleLeaveSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinSessionDto,
  ): Promise<WebSocketResponse> {
    const userId = (client as any).user?.userId;
    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    const sessionKey = this.buildSessionKey(data.roomId, data.sessionId);
    client.leave(sessionKey);

    const members = this.sessionMembers.get(sessionKey);
    if (members) {
      members.delete(userId);
      if (members.size === 0) {
        this.sessionMembers.delete(sessionKey);
      }
    }

    return { success: true };
  }

  @SubscribeMessage('askQuestion')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async handleAskQuestion(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: AskQuestionDto,
  ): Promise<WebSocketResponse<{ question: LiveQnaQuestion }>> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        return { success: false, error: 'Authentication token not found' };
      }

      const response = await axios.post<LiveQnaQuestion>(
        `${this.backendUrl}/rooms/${data.roomId}/live-sessions/${data.sessionId}/live-qna/questions`,
        { content: data.content },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const question = response.data;
      await this.redisService.publish('live-qna', {
        type: 'question-created',
        roomId: data.roomId,
        sessionId: data.sessionId,
        data: question,
      } as LiveQnaRedisPayload);

      return { success: true, payload: { question } };
    } catch (error: any) {
      const status = error?.response?.status;
      const backendBody = error?.response?.data;
      const errorMessage =
        error?.response?.data?.message || error?.message || 'Failed to submit question';
      this.logger.error(
        `Error asking question roomId=${data.roomId} sessionId=${data.sessionId} status=${status} backendBody=${JSON.stringify(backendBody)}`,
        error?.stack,
      );
      return { success: false, error: errorMessage };
    }
  }

  @SubscribeMessage('voteQuestion')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async handleVoteQuestion(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: VoteQuestionDto,
  ): Promise<WebSocketResponse<{ question: LiveQnaQuestion }>> {
    return this.handleVoteToggle(client, data, true);
  }

  @SubscribeMessage('unvoteQuestion')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async handleUnvoteQuestion(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: VoteQuestionDto,
  ): Promise<WebSocketResponse<{ question: LiveQnaQuestion }>> {
    return this.handleVoteToggle(client, data, false);
  }

  @SubscribeMessage('updateQuestionStatus')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async handleUpdateQuestionStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: UpdateQuestionStatusDto,
  ): Promise<WebSocketResponse<{ question: LiveQnaQuestion }>> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        return { success: false, error: 'Authentication token not found' };
      }

      const response = await axios.patch<LiveQnaQuestion>(
        `${this.backendUrl}/rooms/${data.roomId}/live-sessions/${data.sessionId}/live-qna/questions/${data.questionId}/status`,
        { status: data.status },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const question = response.data;
      await this.redisService.publish('live-qna', {
        type: 'question-updated',
        roomId: data.roomId,
        sessionId: data.sessionId,
        data: question,
      } as LiveQnaRedisPayload);

      return { success: true, payload: { question } };
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.message || error?.message || 'Failed to update question status';
      this.logger.error('Error updating question status', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  @SubscribeMessage('removeQuestion')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async handleRemoveQuestion(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: VoteQuestionDto,
  ): Promise<WebSocketResponse<{ id: string }>> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        return { success: false, error: 'Authentication token not found' };
      }

      await axios.delete(
        `${this.backendUrl}/rooms/${data.roomId}/live-sessions/${data.sessionId}/live-qna/questions/${data.questionId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const payload: LiveQnaRedisPayload = {
        type: 'question-removed',
        roomId: data.roomId,
        sessionId: data.sessionId,
        data: { id: data.questionId },
      };
      await this.redisService.publish('live-qna', payload);

      return { success: true, payload: { id: data.questionId } };
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.message || error?.message || 'Failed to remove question';
      this.logger.error('Error removing question', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  private async handleVoteToggle(
    client: Socket,
    data: VoteQuestionDto,
    isVote: boolean,
  ): Promise<WebSocketResponse<{ question: LiveQnaQuestion }>> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        return { success: false, error: 'Authentication token not found' };
      }

      const method = isVote ? 'post' : 'delete';
      const url = `${this.backendUrl}/rooms/${data.roomId}/live-sessions/${data.sessionId}/live-qna/questions/${data.questionId}/votes`;

      const response = await axios.request<LiveQnaQuestion>({
        url,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const question = response.data;
      await this.redisService.publish('live-qna', {
        type: 'question-updated',
        roomId: data.roomId,
        sessionId: data.sessionId,
        data: question,
      } as LiveQnaRedisPayload);

      return { success: true, payload: { question } };
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.message || error?.message || 'Failed to update vote';
      this.logger.error('Error toggling vote', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  private handleRedisMessage(message: LiveQnaRedisPayload) {
    try {
      const { type, roomId, sessionId, data } = message;
      const sessionKey = this.buildSessionKey(roomId, sessionId);

      switch (type) {
        case 'question-created':
          this.server.to(sessionKey).emit('questionCreated', data as LiveQnaQuestion);
          break;
        case 'question-updated':
          this.server.to(sessionKey).emit('questionUpdated', data as LiveQnaQuestion);
          break;
        case 'question-removed':
          this.server
            .to(sessionKey)
            .emit('questionRemoved', {
              id: (data as { id: string }).id,
              roomId,
              sessionId,
            });
          break;
        default:
          this.logger.warn(`Unhandled live-qna redis event: ${type}`);
      }
    } catch (error) {
      this.logger.error('Error handling Redis live-qna message', error);
    }
  }

  private buildSessionKey(roomId: string, sessionId: string) {
    return `session:${roomId}:${sessionId}`;
  }

  private extractToken(client: Socket): string | null {
    let token = client.handshake.headers?.authorization;
    if (token) {
      if (token.startsWith('Bearer ')) {
        return token.slice(7).trim();
      }
      return token.trim();
    }

    token = client.handshake.auth?.token;
    if (token) {
      return token.trim();
    }

    const cookies = client.handshake.headers?.cookie;
    if (cookies) {
      const accessTokenCookie = cookies
        .split(';')
        .find((cookie) => cookie.trim().startsWith('accessToken='));

      if (accessTokenCookie) {
        return accessTokenCookie.split('=')[1].trim();
      }
    }

    return null;
  }
}
