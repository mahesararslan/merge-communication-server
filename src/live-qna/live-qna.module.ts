import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '../redis/redis.module';
import { LiveQnaGateway } from './live-qna.gateway';

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [LiveQnaGateway],
})
export class LiveQnaModule {}
