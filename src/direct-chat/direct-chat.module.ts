import { Module } from '@nestjs/common';
import { DirectChatGateway } from './direct-chat.gateway';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [
    RedisModule,
    ConfigModule
  ],
  providers: [DirectChatGateway]
})
export class DirectChatModule {}
