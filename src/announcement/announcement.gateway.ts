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
import { AnnouncementEvents, RedisAnnouncementPayload } from './types/announcement.type';
import { UseGuards, UsePipes, ValidationPipe, Logger, OnModuleInit } from '@nestjs/common';
import { WsJwtGuard } from 'src/auth/ws-jwt/ws-jwt.guard';
import { SocketAuthMiddleware } from 'src/auth/ws.mw';
import { Announcement } from 'src/entities/announcement.entity';
import { RedisService } from 'src/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { PostAnnouncementDto } from './dto/post-announcement.dto';
import { EditAnnouncementDto } from './dto/edit-announcement.dto';
import { DeleteAnnouncementDto } from './dto/delete-announcement.dto';
import axios from 'axios';

@WebSocketGateway({ 
  namespace: 'announcement',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
})
@UseGuards(WsJwtGuard)
export class AnnouncementGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server: Server<any, AnnouncementEvents>;

  private readonly logger = new Logger(AnnouncementGateway.name);
  private backendUrl: string;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socket IDs
  private roomMembers: Map<string, Set<string>> = new Map(); // roomId -> Set of user IDs

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.backendUrl = this.configService.get<string>('BACKEND_URL', 'http://localhost:3000');
  }

  async onModuleInit() {
    // Subscribe to Redis channels after the module is fully initialized
    try {
      await this.redisService.subscribe('announcements', this.handleRedisMessage.bind(this));
      this.logger.log('Subscribed to Redis announcements channel');
    } catch (error) {
      this.logger.error('Failed to subscribe to Redis:', error.message);
    }
  }

  afterInit(server: Server) {
    server.use(SocketAuthMiddleware() as any);
    this.logger.log('Announcement gateway initialized');
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

  @SubscribeMessage('postAnnouncement')
  @UsePipes(new ValidationPipe())
  async handlePostAnnouncement(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: PostAnnouncementDto,
  ) {
    try {
      const authorId = (client as any).user?.userId;
      
      if (!authorId) {
        return { success: false, error: 'Unauthorized' };
      }

      // Get the token from the client
      const token = this.extractToken(client);
      
      if (!token) {
        this.logger.error('No token found');
        return { success: false, error: 'Authentication token not found' };
      }

      // Clean the token (remove any whitespace or newlines)
      const cleanToken = token.trim();
      
      // Call backend API to create the announcement
      const response = await axios.post(
        `${this.backendUrl}/announcements/create`,
        {
          roomId: data.roomId,
          title: data.title,
          content: data.content,
          isPublished: data.isPublished ?? true,
        },
        {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      
      const savedAnnouncement = response.data as Announcement;

      // Publish to Redis for other instances
      const payload: RedisAnnouncementPayload = {
        type: 'new-announcement',
        data: savedAnnouncement,
        roomId: data.roomId,
        authorId,
      };
      await this.redisService.publish('announcements', payload);

      return { success: true, announcement: savedAnnouncement };
    } catch (error) {
      this.logger.error('Error posting announcement:', error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || 'Failed to post announcement';
      
      // Emit error event to client
      client.emit('error', {
        action: 'postAnnouncement',
        error: errorMessage,
      });

      return { 
        success: false, 
        error: errorMessage
      };
    }
  }

  @SubscribeMessage('editAnnouncement')
  @UsePipes(new ValidationPipe())
  async handleEditAnnouncement(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: EditAnnouncementDto,
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

      // Call backend API to update the announcement
      const response = await axios.patch(
        `${this.backendUrl}/announcements/${data.announcementId}`,
        {
          roomId: data.roomId,
          title: data.title,
          content: data.content,
          isPublished: data.isPublished,
        },
        {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const updatedAnnouncement = response.data as Announcement;

      // Publish to Redis for other instances
      const payload: RedisAnnouncementPayload = {
        type: 'announcement-updated',
        data: updatedAnnouncement,
        roomId: data.roomId,
        authorId: userId,
      };
      await this.redisService.publish('announcements', payload);

      return { success: true, announcement: updatedAnnouncement };
    } catch (error) {
      this.logger.error('Error editing announcement:', error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || 'Failed to edit announcement';
      
      // Emit error event to client
      client.emit('error', {
        action: 'editAnnouncement',
        error: errorMessage,
        announcementId: data.announcementId,
      });

      return { 
        success: false, 
        error: errorMessage
      };
    }
  }

  @SubscribeMessage('deleteAnnouncement')
  @UsePipes(new ValidationPipe())
  async handleDeleteAnnouncement(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: DeleteAnnouncementDto,
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

      // Call backend API to delete the announcement
      await axios.delete(
        `${this.backendUrl}/announcements/${data.announcementId}?roomId=${data.roomId}`,
        {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      // Publish to Redis for other instances to notify all room members
      const payload: RedisAnnouncementPayload = {
        type: 'announcement-deleted',
        data: {
          announcementId: data.announcementId,
          roomId: data.roomId,
        },
        roomId: data.roomId,
        authorId: userId,
      };
      await this.redisService.publish('announcements', payload);

      return { success: true };
    } catch (error) {
      this.logger.error('Error deleting announcement:', error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || 'Failed to delete announcement';
      
      // Emit error event to client
      client.emit('error', {
        action: 'deleteAnnouncement',
        error: errorMessage,
        announcementId: data.announcementId,
      });

      return { 
        success: false, 
        error: errorMessage
      };
    }
  }

  // Method to be called by backend API for scheduled announcements
  async broadcastScheduledAnnouncement(data: any, roomId: string) {
    const payload: RedisAnnouncementPayload = {
      type: 'new-announcement',
      data: data,
      roomId,
      authorId: data.authorId,
    };
    await this.redisService.publish('announcements', payload);
  }

  private handleRedisMessage(message: any) {
    try {
      // Message is already parsed by RedisService
      const payload: RedisAnnouncementPayload = message;

      switch (payload.type) {
        case 'new-announcement':
          if (payload.roomId) {
            this.handleNewAnnouncement(payload.data as Announcement, payload.roomId);
          }
          break;
        case 'announcement-deleted':
          if (payload.roomId) {
            this.handleAnnouncementDeleted(payload.data, payload.roomId);
          }
          break;
        case 'announcement-updated':
          if (payload.roomId) {
            this.handleAnnouncementUpdated(payload.data as Announcement, payload.roomId);
          }
          break;
      }
    } catch (error) {
      this.logger.error('Error handling Redis message:', error);
    }
  }

  private handleNewAnnouncement(announcement: Announcement, roomId: string) {
    // Broadcast to all members in the room
    this.server.to(`room:${roomId}`).emit('newAnnouncement', announcement);
  }

  private handleAnnouncementDeleted(data: { announcementId: string; roomId: string }, roomId: string) {
    // Broadcast to all room members
    this.server.to(`room:${roomId}`).emit('announcementDeleted', data);
  }

  private handleAnnouncementUpdated(announcement: Announcement, roomId: string) {
    // Broadcast to all members in the room
    this.server.to(`room:${roomId}`).emit('announcementUpdated', announcement);
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
