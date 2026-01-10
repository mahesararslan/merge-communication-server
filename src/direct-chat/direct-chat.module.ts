import { Module } from '@nestjs/common';
import { DirectChatGateway } from './direct-chat.gateway';

@Module({
  providers: [DirectChatGateway]
})
export class DirectChatModule {}
