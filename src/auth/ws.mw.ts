import { Socket } from 'socket.io';
import { WsJwtGuard } from './ws-jwt/ws-jwt.guard';

export type SocketIOMiddleware = {
    (client: Socket, next: (err?: Error) => void);
};

export const SocketAuthMiddleware = (): SocketIOMiddleware => {
    
    return async (client, next) => {
        try {
            await WsJwtGuard.validateToken(client);
            next();
        } catch (err) {
            next(err);
        }
    };
}