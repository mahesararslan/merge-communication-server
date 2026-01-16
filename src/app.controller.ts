import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { AnnouncementGateway } from './announcement/announcement.gateway';
import { NotificationGateway } from './notification/notification.gateway';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly announcementGateway: AnnouncementGateway,
    private readonly notificationGateway: NotificationGateway,
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
}
