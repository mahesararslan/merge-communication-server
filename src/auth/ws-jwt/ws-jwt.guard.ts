import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Socket } from 'socket.io';
import axios from 'axios';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private static readonly logger = new Logger(WsJwtGuard.name);

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    if (context.getType() !== 'ws') {
      return true;
    }

    const client: Socket = context.switchToWs().getClient();
    WsJwtGuard.logger.log(`WebSocket authentication attempt for socket ${client.id}`);
    
    try {
      const result = await WsJwtGuard.validateToken(client);
      WsJwtGuard.logger.log(`Authentication successful for socket ${client.id}`);
      return result;
    } catch (error) {
      WsJwtGuard.logger.error(`Authentication failed for socket ${client.id}: ${error.message}`);
      return false;
    }
  }

  static async validateToken(client: Socket): Promise<boolean> {
    // it will be in cookies for when NODE_ENV=production else in headers
    WsJwtGuard.logger.log('Starting token extraction...');
    const token = WsJwtGuard.extractToken(client);
    
    if (!token) {
      WsJwtGuard.logger.warn('No token found in request');
      throw new UnauthorizedException('No token provided');
    }

    WsJwtGuard.logger.log(`Token extracted (first 20 chars): ${token}`);

    try {
      // Call backend API to validate token
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
      WsJwtGuard.logger.log(`Calling backend validation at: ${backendUrl}/auth/validate-token`);
      
      const response: any = await axios.post(`${backendUrl}/auth/validate-token`, {
        token,
      });

      WsJwtGuard.logger.log(`Backend response status: ${response.status}`);
      WsJwtGuard.logger.log(`Backend response data:`, JSON.stringify(response.data, null, 2));
      WsJwtGuard.logger.log(`Response data type: ${typeof response.data}`);
      WsJwtGuard.logger.log(`Valid field:`, response.data?.valid);
      WsJwtGuard.logger.log(`UserId field:`, response.data?.userId);

      if (response.data?.valid) {
        // Attach user info to client for later use
        (client as any).user = {
          userId: response.data?.userId,
          email: response.data?.email,
          role: response.data?.role,
        };
        WsJwtGuard.logger.log(`User authenticated: ${response.data?.userId} (${response.data?.email})`);
        return true;
      }

      WsJwtGuard.logger.warn('Token validation returned valid=false');
      throw new UnauthorizedException('Invalid token');
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      WsJwtGuard.logger.error(`Token validation error: ${error.message}`, error.response?.data || '');
      throw new UnauthorizedException('Token validation failed: ' + error.message);
    }
  }

  private static extractToken(client: Socket): string | null {
    // Try to get token from headers first (for local development with Postman)
    WsJwtGuard.logger.log('Attempting to extract token from headers...');
    let token = client.handshake.headers?.authorization;
    
    if (token) {
      WsJwtGuard.logger.log('Token found in Authorization header');
      // Remove 'Bearer ' prefix if present
      if (token.startsWith('Bearer ')) {
        const extracted = token.slice(7);
        WsJwtGuard.logger.log('Removed "Bearer " prefix from token');
        return extracted;
      }
      WsJwtGuard.logger.log('Using token from Authorization header as-is');
      return token;
    }
    WsJwtGuard.logger.log('No token in Authorization header');

    // Try to get from auth object (alternative method)
    WsJwtGuard.logger.log('Attempting to extract token from auth object...');
    token = client.handshake.auth?.token;
    if (token) {
      WsJwtGuard.logger.log('Token found in auth object');
      return token;
    }
    WsJwtGuard.logger.log('No token in auth object');

    // For production, try to get from cookies
    WsJwtGuard.logger.log('Attempting to extract token from cookies...');
    const cookies = client.handshake.headers?.cookie;
    WsJwtGuard.logger.log('Cookies string:', cookies || 'None');
    
    if (cookies) {
      const accessTokenCookie = cookies
        .split(';')
        .find(cookie => cookie.trim().startsWith('accessToken='));
      
      if (accessTokenCookie) {
        const cookieToken = accessTokenCookie.split('=')[1];
        WsJwtGuard.logger.log('Token found in accessToken cookie');
        return cookieToken;
      }
      WsJwtGuard.logger.log('No accessToken cookie found');
    } else {
      WsJwtGuard.logger.log('No cookies present in request');
    }

    WsJwtGuard.logger.warn('Token not found in any location (headers, auth, cookies)');
    return null;
  }
}
