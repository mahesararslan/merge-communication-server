import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { AnnouncementGateway } from './announcement/announcement.gateway';
import { NotificationGateway } from './notification/notification.gateway';
import { LiveSessionGateway } from './live-session/live-session.gateway';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly announcementGateway: AnnouncementGateway,
    private readonly notificationGateway: NotificationGateway,
    private readonly liveSessionGateway: LiveSessionGateway,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('internal/announcement-published')
  async handleAnnouncementPublished(@Body() data: any) {
    // This endpoint is called by the backend when a scheduled announcement is published
    await this.announcementGateway.broadcastScheduledAnnouncement(data, data.roomId);
    return { success: true };
  }

  @Post('internal/notification')
  async handleNotification(@Body() data: { notification: any; userId: string }) {
    // This endpoint is called by the backend to broadcast notifications to connected users
    await this.notificationGateway.broadcastNotification(data.notification, data.userId);
    return { success: true };
  }

  @Post('internal/live-session-event')
  async handleLiveSessionEvent(@Body() data: { type: string; roomId: string; session?: any; sessionId?: string; status?: string }) {
    // This endpoint is called by the backend for session-created, session-started, session-cancelled
    await this.liveSessionGateway.broadcastSessionEvent(data.roomId, data.type, data);
    return { success: true };
  }

  @Post('internal/live-session-ended')
  async handleLiveSessionEnded(@Body() data: { roomId: string; sessionId: string; reason: string; endedAt: string; endedBy?: string }) {
    // This endpoint is called by the backend when a session ends
    // Broadcast to room (for card updates)
    await this.liveSessionGateway.broadcastSessionEvent(data.roomId, 'session-ended', data);
    // Also broadcast to the specific session namespace (for in-session clients)
    await this.liveSessionGateway.broadcastToSession(data.sessionId, 'session-ended', data);
    return { success: true };
  }
}
