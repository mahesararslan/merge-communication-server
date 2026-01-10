import { SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io'
import { DirectMessageEvents } from './types/direct-chat.type';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from 'src/auth/ws-jwt/ws-jwt.guard';
import { SocketAuthMiddleware } from 'src/auth/ws.mw';
import { Message } from 'src/entities/message.entity';

@WebSocketGateway({ namespace: 'direct-chat' })
@UseGuards(WsJwtGuard)
export class DirectChatGateway {
  @WebSocketServer()
  server: Server<any, DirectMessageEvents>;

  afterInit(client: Socket) {
    client.use(SocketAuthMiddleware() as any);
  }

  @SubscribeMessage('message')
  handleMessage(client: any, payload: any): string {
    return 'Hello world!';
  }

  sendMessage(message: Message) {
    this.server.emit('newMessage', message); 
  }
}
