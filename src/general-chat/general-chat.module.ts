import { Module } from '@nestjs/common';
import { GeneralChatGateway } from './general-chat.gateway';
import { RedisModule } from '../redis/redis.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    RedisModule,
    ConfigModule
  ],
  providers: [GeneralChatGateway],
  exports: [GeneralChatGateway],
})
export class GeneralChatModule {}
