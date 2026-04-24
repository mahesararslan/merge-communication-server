import { Module } from '@nestjs/common';
import { LiveSessionGateway } from './live-session.gateway';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [RedisModule, AuthModule],
  providers: [LiveSessionGateway],
  exports: [LiveSessionGateway],
})
export class LiveSessionModule {}
