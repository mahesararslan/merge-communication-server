import { 
  WebSocketGateway, 
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { NotificationEvents, NotificationPayload, RedisNotificationPayload } from './types/notification.type';
import { UseGuards, Logger, OnModuleInit } from '@nestjs/common';
import { WsJwtGuard } from 'src/auth/ws-jwt/ws-jwt.guard';
import { SocketAuthMiddleware } from 'src/auth/ws.mw';
import { RedisService } from 'src/redis/redis.service';

@WebSocketGateway({ 
  namespace: 'notifications',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
})
@UseGuards(WsJwtGuard)
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server: Server<any, NotificationEvents>;

  private readonly logger = new Logger(NotificationGateway.name);
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socket IDs

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit() {
    // Subscribe to Redis channels after the module is fully initialized
    try {
      await this.redisService.subscribe('notifications', this.handleRedisMessage.bind(this));
      this.logger.log('Subscribed to Redis notifications channel');
    } catch (error) {
      this.logger.error('Failed to subscribe to Redis:', error.message);
    }
  }

  afterInit(server: Server) {
    server.use(SocketAuthMiddleware() as any);
    this.logger.log('Notification gateway initialized');
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

  // Method to be called by backend API to broadcast notifications
  async broadcastNotification(notification: NotificationPayload, userId: string) {
    const payload: RedisNotificationPayload = {
      type: 'notification',
      data: notification,
      userId,
    };
    await this.redisService.publish('notifications', payload);
  }

  private handleRedisMessage(message: any) {
    try {
      // Message is already parsed by RedisService
      const payload: RedisNotificationPayload = message;

      if (payload.type === 'notification' && payload.userId) {
        this.handleNewNotification(payload.data, payload.userId);
      }
    } catch (error) {
      this.logger.error('Error handling Redis message:', error);
    }
  }

  private handleNewNotification(notification: NotificationPayload, userId: string) {
    // Broadcast to all user's connected devices
    this.server.to(`user:${userId}`).emit('notification', notification);
  }
}
