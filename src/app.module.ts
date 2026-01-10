import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DirectChatModule } from './direct-chat/direct-chat.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [DirectChatModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
