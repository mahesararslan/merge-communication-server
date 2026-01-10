import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Socket } from 'socket.io';
import axios from 'axios';

@Injectable()
export class WsJwtGuard implements CanActivate {
  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    if (context.getType() !== 'ws') {
      return true;
    }

    const client: Socket = context.switchToWs().getClient();
    try {
      return await WsJwtGuard.validateToken(client);
    } catch (error) {
      return false;
    }
  }

  static async validateToken(client: Socket): Promise<boolean> {
    // it will be in cookies for when NODE_ENV=production else in headers
    const token = WsJwtGuard.extractToken(client);
    
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      // Call backend API to validate token
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
      const response: any = await axios.post(`${backendUrl}/auth/validate-token`, {
        token,
      });

      if (response.data?.valid) {
        // Attach user info to client for later use
        (client as any).user = {
          userId: response.data?.userId,
          email: response.data?.email,
          role: response.data?.role,
        };
        return true;
      }

      throw new UnauthorizedException('Invalid token');
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Token validation failed: ' + error.message);
    }
  }

  private static extractToken(client: Socket): string | null {
    // Try to get token from headers first (for local development with Postman)
    let token = client.handshake.headers?.authorization;
    
    if (token) {
      // Remove 'Bearer ' prefix if present
      if (token.startsWith('Bearer ')) {
        return token.slice(7);
      }
      return token;
    }

    // Try to get from auth object (alternative method)
    token = client.handshake.auth?.token;
    if (token) {
      return token;
    }

    // For production, try to get from cookies
    const cookies = client.handshake.headers?.cookie;
    if (cookies) {
      const accessTokenCookie = cookies
        .split(';')
        .find(cookie => cookie.trim().startsWith('accessToken='));
      
      if (accessTokenCookie) {
        return accessTokenCookie.split('=')[1];
      }
    }

    return null;
  }
}
