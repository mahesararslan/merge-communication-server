import { 
  SubscribeMessage, 
  WebSocketGateway, 
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io'
import { DirectMessageEvents, RedisMessagePayload } from './types/direct-chat.type';
import { UseGuards, UsePipes, ValidationPipe, Logger, OnModuleInit } from '@nestjs/common';
import { WsJwtGuard } from 'src/auth/ws-jwt/ws-jwt.guard';
import { SocketAuthMiddleware } from 'src/auth/ws.mw';
import { Message } from 'src/entities/message.entity';
import { RedisService } from 'src/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { SendMessageDto } from './dto/send-message.dto';
import { DeleteMessageDto } from './dto/delete-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import axios from 'axios';

@WebSocketGateway({ 
  namespace: 'direct-chat',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
@UseGuards(WsJwtGuard)
export class DirectChatGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server: Server<any, DirectMessageEvents>;

  private readonly logger = new Logger(DirectChatGateway.name);
  private readonly EDIT_TIME_LIMIT = 180 * 60 * 1000; // 180 minutes in milliseconds
  private backendUrl: string;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socket IDs

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.backendUrl = this.configService.get<string>('BACKEND_URL', 'http://localhost:3000');
  }

  async onModuleInit() {
    // Subscribe to Redis channels after the module is fully initialized
    try {
      await this.redisService.subscribe('direct-messages', this.handleRedisMessage.bind(this));
      this.logger.log('Subscribed to Redis direct-messages channel');
    } catch (error) {
      this.logger.error('Failed to subscribe to Redis:', error.message);
    }
  }

  afterInit(server: Server) {
    server.use(SocketAuthMiddleware() as any);
    this.logger.log('Direct chat gateway initialized');
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

  @SubscribeMessage('sendMessage')
  @UsePipes(new ValidationPipe())
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SendMessageDto,
  ) {
    try {
      const senderId = (client as any).user?.userId;
      
      if (!senderId) {
        return { success: false, error: 'Unauthorized' };
      }

      // Validate that either content or attachmentURL is provided
      if (!data.content && !data.attachmentURL) {
        return { success: false, error: 'Either content or attachmentURL must be provided' };
      }

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
        `${this.backendUrl}/direct-messages`,
        {
          recipientId: data.recipientId,
          content: data.content || null,
          attachmentURL: data.attachmentURL || null,
          replyToId: data.replyToId || null,
        },
        {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      this.logger.log('Message saved response:', response.data);
      const savedMessage = response.data as Message;

      // Publish to Redis for other instances
      const payload: RedisMessagePayload = {
        type: 'new-message',
        data: savedMessage,
        recipientId: data.recipientId,
        senderId,
      };
      await this.redisService.publish('direct-messages', payload);

      return { success: true, message: savedMessage };
    } catch (error) {
      this.logger.error('Error sending message:', error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || 'Failed to send message';
      
      // Emit error event to client
      client.emit('error', {
        action: 'sendMessage',
        error: errorMessage,
      });

      return { 
        success: false, 
        error: errorMessage
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
        `${this.backendUrl}/direct-messages/${data.messageId}`,
        {
          content: data.content,
          attachmentURL: data.attachmentURL,
        },
        {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      this.logger.log('Message updated response:', response.data);

      const updatedMessage = response.data as Message;

      // Publish to Redis for other instances
      const payload: RedisMessagePayload = {
        type: 'message-updated',
        data: updatedMessage,
        senderId: userId,
        recipientId: updatedMessage.recipient?.id,
      };
      await this.redisService.publish('direct-messages', payload);

      return { success: true, message: updatedMessage };
    } catch (error) {
      this.logger.error('Error updating message:', error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || 'Failed to update message';
      
      // Emit error event to client
      client.emit('error', {
        action: 'updateMessage',
        error: errorMessage,
        messageId: data.messageId,
      });

      return { 
        success: false, 
        error: errorMessage
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
        `${this.backendUrl}/direct-messages/${data.messageId}/for-me`,
        {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      // No need to publish to Redis as this is user-specific
      // The message is only deleted for this specific user

      return { success: true };
    } catch (error) {
      this.logger.error('Error deleting message for user:', error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || 'Failed to delete message';
      
      // Emit error event to client
      client.emit('error', {
        action: 'deleteForMe',
        error: errorMessage,
        messageId: data.messageId,
      });

      return { 
        success: false, 
        error: errorMessage
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
        `${this.backendUrl}/direct-messages/${data.messageId}/for-everyone`,
        {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const deletedMessage = response.data as any;

      // Publish to Redis for other instances to notify all users
      const payload: RedisMessagePayload = {
        type: 'message-deleted',
        data: {
          messageId: data.messageId,
          deletedFor: 'everyone',
          senderId: deletedMessage.sender?.id || userId,
          recipientId: deletedMessage.recipient?.id,
        },
        senderId: userId,
        recipientId: deletedMessage.recipient?.id,
      };
      await this.redisService.publish('direct-messages', payload);

      return { success: true };
    } catch (error) {
      this.logger.error('Error deleting message for everyone:', error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || 'Failed to delete message for everyone';
      
      // Emit error event to client
      client.emit('error', {
        action: 'deleteForEveryone',
        error: errorMessage,
        messageId: data.messageId,
      });

      return { 
        success: false, 
        error: errorMessage
      };
    }
  }

  private handleRedisMessage(message: any) {
    try {
      // Message is already parsed by RedisService, no need to parse again
      const payload: RedisMessagePayload = message;

      switch (payload.type) {
        case 'new-message':
          if (payload.senderId && payload.recipientId) {
            this.handleNewMessage(payload.data as Message, payload.senderId, payload.recipientId);
          }
          break;
        case 'message-deleted':
          this.handleMessageDeletedFromRedis(payload.data);
          break;
        case 'message-updated':
          if (payload.senderId && payload.recipientId) {
            this.handleMessageUpdatedFromRedis(payload.data, payload.senderId, payload.recipientId);
          }
          break;
      }
    } catch (error) {
      this.logger.error('Error handling Redis message:', error);
    }
  }

  private handleNewMessage(message: Message, senderId: string, recipientId: string) {
    // Send to recipient
    this.server.to(`user:${recipientId}`).emit('newMessage', message);
    
    // Also send to sender (for multi-device support)
    this.server.to(`user:${senderId}`).emit('newMessage', message);
  }

  private handleMessageDeletedFromRedis(data: { messageId: string; deletedFor: 'me' | 'everyone'; senderId: string; recipientId: string }) {
    // Broadcast to sender and recipient
    if (data.senderId) {
      this.server.to(`user:${data.senderId}`).emit('messageDeleted', data);
    }
    if (data.recipientId) {
      this.server.to(`user:${data.recipientId}`).emit('messageDeleted', data);
    }
  }

  private handleMessageUpdatedFromRedis(message: Message, senderId: string, recipientId: string) {
    // Send to recipient
    this.server.to(`user:${recipientId}`).emit('messageUpdated', message);
    
    // Also send to sender (for multi-device support)
    this.server.to(`user:${senderId}`).emit('messageUpdated', message);
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
    if (cookies) {
      const accessTokenCookie = cookies
        .split(';')
        .find(cookie => cookie.trim().startsWith('accessToken='));
      
      if (accessTokenCookie) {
        return accessTokenCookie.split('=')[1].trim();
      }
    }

    this.logger.warn('No token found in headers, auth, or cookies');
    this.logger.debug('Headers:', JSON.stringify(client.handshake.headers));
    this.logger.debug('Auth:', JSON.stringify(client.handshake.auth));

    return null;
  }
}
