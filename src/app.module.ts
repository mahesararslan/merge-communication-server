import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DirectChatModule } from './direct-chat/direct-chat.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './redis/redis.module';
import { GeneralChatModule } from './general-chat/general-chat.module';
import { AnnouncementModule } from './announcement/announcement.module';
import { NotificationModule } from './notification/notification.module';
import { LiveQnaModule } from './live-qna/live-qna.module';
import { LiveSessionModule } from './live-session/live-session.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    RedisModule,
    DirectChatModule, 
    AuthModule, 
    GeneralChatModule, 
    AnnouncementModule, 
    NotificationModule,
    LiveQnaModule,
    LiveSessionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
