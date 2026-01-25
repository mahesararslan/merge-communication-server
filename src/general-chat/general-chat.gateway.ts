import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  GeneralChatEvents,
  RedisMessagePayload,
} from './types/general-chat.type';
import {
  UseGuards,
  UsePipes,
  ValidationPipe,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { WsJwtGuard } from 'src/auth/ws-jwt/ws-jwt.guard';
import { SocketAuthMiddleware } from 'src/auth/ws.mw';
import { GeneralChatMessage } from 'src/entities/general-chat-message.entity';
import { RedisService } from 'src/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { SendMessageDto } from './dto/send-message.dto';
import { DeleteMessageDto } from './dto/delete-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import axios from 'axios';

@WebSocketGateway({
  namespace: 'general-chat',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
@UseGuards(WsJwtGuard)
export class GeneralChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server<any, GeneralChatEvents>;

  private readonly logger = new Logger(GeneralChatGateway.name);
  private backendUrl: string;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socket IDs
  private roomMembers: Map<string, Set<string>> = new Map(); // roomId -> Set of user IDs

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.backendUrl = this.configService.get<string>(
      'BACKEND_URL',
      'http://localhost:3000',
    );
  }

  async onModuleInit() {
    // Subscribe to Redis channels after the module is fully initialized
    try {
      await this.redisService.subscribe(
        'general-chat',
        this.handleRedisMessage.bind(this),
      );
      this.logger.log('Subscribed to Redis general-chat channel');
    } catch (error) {
      this.logger.error('Failed to subscribe to Redis:', error.message);
    }
  }

  afterInit(server: Server) {
    server.use(SocketAuthMiddleware() as any);
    this.logger.log('General chat gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const userId = (client as any).user?.userId;

      if (!userId) {
        this.logger.warn('Client connected without user info');
        client.disconnect();
        return;
      }

      // Track user's socket connections
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

      // Join a room specific to this user
      client.join(`user:${userId}`);

      this.logger.log(`Client ${client.id} connected for user ${userId}`);
    } catch (error) {
      this.logger.error('Error handling connection:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client as any).user?.userId;

    if (userId) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
      this.logger.log(`Client ${client.id} disconnected for user ${userId}`);
    }
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      const userId = (client as any).user?.userId;

      if (!userId) {
        return { success: false, error: 'Unauthorized' };
      }

      // Join the room channel
      client.join(`room:${data.roomId}`);

      // Track room membership
      if (!this.roomMembers.has(data.roomId)) {
        this.roomMembers.set(data.roomId, new Set());
      }
      this.roomMembers.get(data.roomId)!.add(userId);

      return { success: true };
    } catch (error) {
      this.logger.error('Error joining room:', error);
      return { success: false, error: 'Failed to join room' };
    }
  }

  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      const userId = (client as any).user?.userId;

      if (!userId) {
        return { success: false, error: 'Unauthorized' };
      }

      // Leave the room channel
      client.leave(`room:${data.roomId}`);

      // Remove from room membership tracking
      const members = this.roomMembers.get(data.roomId);
      if (members) {
        members.delete(userId);
        if (members.size === 0) {
          this.roomMembers.delete(data.roomId);
        }
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Error leaving room:', error);
      return { success: false, error: 'Failed to leave room' };
    }
  }

  @SubscribeMessage('sendMessage')
  @UsePipes(new ValidationPipe())
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SendMessageDto,
  ) {
    try {
      const authorId = (client as any).user?.userId;
      console.log('Message sent by user: ', JSON.stringify(data));
      if (!authorId) {
        return { success: false, error: 'Unauthorized' };
      }

      // Validate that either content or attachments is provided
      if (
        !data.content &&
        (!data.attachments || data.attachments.length === 0)
      ) {
        return {
          success: false,
          error: 'Either content or attachments must be provided',
        };
      }

      // Variables prepared for logic

      // Get the token from the client
      const token = this.extractToken(client);

      if (!token) {
        this.logger.error('No token found');
        return { success: false, error: 'Authentication token not found' };
      }

      // Clean the token (remove any whitespace or newlines)
      const cleanToken = token.trim();

      // Call backend API to store the message
      const response = await axios.post(
        `${this.backendUrl}/general-chat`,
        {
          roomId: data.roomId,
          content: data.content || null,
          attachments: data.attachments || null,
          replyToId: data.replyToId || null,
        },
        {
          headers: {
            Authorization: `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const savedMessage = this.transformMessage(
        response.data as GeneralChatMessage,
      );

      // Publish to Redis for other instances
      const payload: RedisMessagePayload = {
        type: 'new-message',
        data: savedMessage,
        roomId: data.roomId,
        authorId,
      };
      await this.redisService.publish('general-chat', payload);

      return { success: true, message: savedMessage };
    } catch (error) {
      this.logger.error(
        'Error sending message:',
        error.response?.data || error.message,
      );
      const errorMessage =
        error.response?.data?.message || 'Failed to send message';

      // Emit error event to client
      client.emit('error', {
        action: 'sendMessage',
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  @SubscribeMessage('updateMessage')
  @UsePipes(new ValidationPipe())
  async handleUpdateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: UpdateMessageDto,
  ) {
    try {
      const userId = (client as any).user?.userId;

      if (!userId) {
        return { success: false, error: 'Unauthorized' };
      }

      const token = this.extractToken(client);

      if (!token) {
        this.logger.error('No token found');
        return { success: false, error: 'Authentication token not found' };
      }

      const cleanToken = token.trim();

      // Call backend API to update the message - backend handles all validation
      const response = await axios.patch(
        `${this.backendUrl}/general-chat/${data.messageId}?roomId=${data.roomId}`,
        {
          content: data.content,
          attachments: data.attachments || null,
        },
        {
          headers: {
            Authorization: `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const updatedMessage = this.transformMessage(
        response.data as GeneralChatMessage,
      );

      // Publish to Redis for other instances
      const payload: RedisMessagePayload = {
        type: 'message-updated',
        data: updatedMessage,
        roomId: data.roomId,
        authorId: userId,
      };
      await this.redisService.publish('general-chat', payload);

      return { success: true, message: updatedMessage };
    } catch (error) {
      this.logger.error(
        'Error updating message:',
        error.response?.data || error.message,
      );
      const errorMessage =
        error.response?.data?.message || 'Failed to update message';

      // Emit error event to client
      client.emit('error', {
        action: 'updateMessage',
        error: errorMessage,
        messageId: data.messageId,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  @SubscribeMessage('deleteForMe')
  @UsePipes(new ValidationPipe())
  async handleDeleteForMe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: DeleteMessageDto,
  ) {
    try {
      const userId = (client as any).user?.userId;

      if (!userId) {
        return { success: false, error: 'Unauthorized' };
      }

      const token = this.extractToken(client);

      if (!token) {
        this.logger.error('No token found');
        return { success: false, error: 'Authentication token not found' };
      }

      const cleanToken = token.trim();

      // Call backend API to delete message for this user
      await axios.delete(
        `${this.backendUrl}/general-chat/${data.messageId}/for-me?roomId=${data.roomId}`,
        {
          headers: {
            Authorization: `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      // No need to publish to Redis as this is user-specific
      // The message is only deleted for this specific user

      return { success: true };
    } catch (error) {
      this.logger.error(
        'Error deleting message for user:',
        error.response?.data || error.message,
      );
      const errorMessage =
        error.response?.data?.message || 'Failed to delete message';

      // Emit error event to client
      client.emit('error', {
        action: 'deleteForMe',
        error: errorMessage,
        messageId: data.messageId,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  @SubscribeMessage('deleteForEveryone')
  @UsePipes(new ValidationPipe())
  async handleDeleteForEveryone(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: DeleteMessageDto,
  ) {
    try {
      const userId = (client as any).user?.userId;

      if (!userId) {
        return { success: false, error: 'Unauthorized' };
      }

      const token = this.extractToken(client);

      if (!token) {
        this.logger.error('No token found');
        return { success: false, error: 'Authentication token not found' };
      }

      const cleanToken = token.trim();

      // Call backend API to delete message for everyone
      const response = await axios.delete(
        `${this.backendUrl}/general-chat/${data.messageId}/for-everyone?roomId=${data.roomId}`,
        {
          headers: {
            Authorization: `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const deletedMessage = response.data as any;

      // Publish to Redis for other instances to notify all room members
      const payload: RedisMessagePayload = {
        type: 'message-deleted',
        data: {
          messageId: data.messageId,
          deletedFor: 'everyone',
          roomId: data.roomId,
          authorId: deletedMessage.author?.id || userId,
        },
        roomId: data.roomId,
        authorId: userId,
      };
      await this.redisService.publish('general-chat', payload);

      return { success: true };
    } catch (error) {
      this.logger.error(
        'Error deleting message for everyone:',
        error.response?.data || error.message,
      );
      const errorMessage =
        error.response?.data?.message ||
        'Failed to delete message for everyone';

      // Emit error event to client
      client.emit('error', {
        action: 'deleteForEveryone',
        error: errorMessage,
        messageId: data.messageId,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private handleRedisMessage(message: any) {
    try {
      // Message is already parsed by RedisService, no need to parse again
      const payload: RedisMessagePayload = message;

      switch (payload.type) {
        case 'new-message':
          if (payload.roomId) {
            this.handleNewMessage(
              this.transformMessage(payload.data as GeneralChatMessage),
              payload.roomId,
            );
          }
          break;
        case 'message-deleted':
          if (payload.roomId) {
            this.handleMessageDeletedFromRedis(payload.data, payload.roomId);
          }
          break;
        case 'message-updated':
          if (payload.roomId) {
            this.handleMessageUpdatedFromRedis(
              this.transformMessage(payload.data as GeneralChatMessage),
              payload.roomId,
            );
          }
          break;
      }
    } catch (error) {
      this.logger.error('Error handling Redis message:', error);
    }
  }

  private handleNewMessage(message: GeneralChatMessage, roomId: string) {
    // Broadcast to all members in the room
      console.log(`📤 Emitting newMessage to room:${roomId}`, message.id);

    this.server.to(`room:${roomId}`).emit('newMessage', message);
  }

  private handleMessageDeletedFromRedis(
    data: {
      messageId: string;
      deletedFor: 'everyone';
      roomId: string;
      authorId: string;
    },
    roomId: string,
  ) {
    // Broadcast to all room members
    this.server.to(`room:${roomId}`).emit('messageDeleted', data);
  }

  private handleMessageUpdatedFromRedis(
    message: GeneralChatMessage,
    roomId: string,
  ) {
    // Broadcast to all members in the room
    this.server.to(`room:${roomId}`).emit('messageUpdated', message);
  }

  private extractToken(client: Socket): string | null {
    // Try to get token from headers first
    let token = client.handshake.headers?.authorization;

    if (token) {
      if (token.startsWith('Bearer ')) {
        return token.slice(7).trim();
      }
      return token.trim();
    }

    // Try to get from auth object
    token = client.handshake.auth?.token;
    if (token) {
      return token.trim();
    }

    // Try to get from cookies
    const cookies = client.handshake.headers?.cookie;
    this.logger.log('Checking cookies for token');
    this.logger.log('Cookies string:', cookies);

    if (cookies) {
      const accessTokenCookie = cookies
        .split(';')
        .find((cookie) => cookie.trim().startsWith('accessToken='));

      this.logger.log(
        'Found accessToken cookie:',
        accessTokenCookie ? 'Yes' : 'No',
      );

      if (accessTokenCookie) {
        const cookieToken = accessTokenCookie.split('=')[1].trim();
        this.logger.log(
          'Extracted token from cookie (first 20 chars):',
          cookieToken.substring(0, 20) + '...',
        );
        return cookieToken;
      }
    } else {
      this.logger.log('No cookies found in handshake headers');
    }

    this.logger.warn('No token found in headers, auth, or cookies');
    this.logger.debug('Headers:', JSON.stringify(client.handshake.headers));
    this.logger.debug('Auth:', JSON.stringify(client.handshake.auth));

    return null;
  }

  /**
   * Transform message to support frontend attachments array structure
   * Maps legacy attachmentURL -> attachments[]
   */
  private transformMessage(message: GeneralChatMessage): GeneralChatMessage {
    if (!message) return message;

    // Create shallow copy to avoid mutating original if needed
    // Cast to any to allow adding 'attachments' property if not in type definition yet
    const transformed = { ...message } as any;

    // If backend returns attachmentURL, populate attachments array shim
    if (
      transformed.attachmentURL &&
      (!transformed.attachments || transformed.attachments.length === 0)
    ) {
      transformed.attachments = [
        {
          id: `att-${transformed.id}`, // Generate deterministic ID or use what we have
          name: 'Attachment', // We don't save name in legacy backend, so use generic
          url: transformed.attachmentURL,
          // type: 'file', // Default type
        },
      ];
    } else if (!transformed.attachments) {
      transformed.attachments = [];
    }

    return transformed as GeneralChatMessage;
  }
}
