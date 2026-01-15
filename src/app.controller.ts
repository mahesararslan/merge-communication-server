import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';
import { AnnouncementGateway } from './announcement/announcement.gateway';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly announcementGateway: AnnouncementGateway,
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
}
