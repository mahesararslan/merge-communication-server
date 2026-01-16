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
    AnnouncementModule, NotificationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

