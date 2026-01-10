import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DirectChatModule } from './direct-chat/direct-chat.module';

@Module({
  imports: [DirectChatModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
