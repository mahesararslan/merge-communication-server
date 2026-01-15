import { Module } from '@nestjs/common';
import { AnnouncementGateway } from './announcement.gateway';
import { RedisModule } from 'src/redis/redis.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [RedisModule, ConfigModule, AuthModule],
  providers: [AnnouncementGateway],
  exports: [AnnouncementGateway],
})
export class AnnouncementModule {}
