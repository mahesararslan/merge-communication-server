import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private publisher: Redis;
  private subscriber: Redis;
  private messageHandlers: Map<string, (message: any) => void> = new Map();
  private readonly logger = new Logger(RedisService.name);
  private isReady: boolean = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const url = this.configService.get<string>('REDIS_URL');
    const options: any = {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        return Math.min(times * 100, 3000);
      },
    };

    if (url?.startsWith('rediss://')) {
      options.tls = { rejectUnauthorized: false };
    }

    if (url) {
      this.publisher = new Redis(url, options);
      this.subscriber = new Redis(url, options);
    } else {
      const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
      const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
      const redisPassword = this.configService.get<string>('REDIS_PASSWORD', '');

      this.publisher = new Redis({
        host: redisHost,
        port: redisPort,
        ...(redisPassword && { password: redisPassword }),
        ...options,
      });
      this.subscriber = new Redis({
        host: redisHost,
        port: redisPort,
        ...(redisPassword && { password: redisPassword }),
        ...options,
      });
    }

    this.publisher.on('error', (err) => this.logger.error('Redis Publisher Error', err.message));
    this.subscriber.on('error', (err) => this.logger.error('Redis Subscriber Error', err.message));

    // Wait for both connections to be ready with a timeout
    const readyTimeout = 10000;
    try {
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Redis Publisher timeout')), readyTimeout);
          if (this.publisher.status === 'ready') {
            clearTimeout(timeout);
            resolve();
          } else {
            this.publisher.once('ready', () => {
              clearTimeout(timeout);
              resolve();
            });
          }
        }),
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Redis Subscriber timeout')), readyTimeout);
          if (this.subscriber.status === 'ready') {
            clearTimeout(timeout);
            resolve();
          } else {
            this.subscriber.once('ready', () => {
              clearTimeout(timeout);
              resolve();
            });
          }
        }),
      ]);
      this.isReady = true;
      this.logger.log('Redis connected successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Redis connections:', error.message);
      // Don't throw, let it retry in background
    }

    this.subscriber.on('message', (channel: string, message: string) => {
      const handler = this.messageHandlers.get(channel);
      if (handler) {
        try {
          const parsedMessage = JSON.parse(message);
          handler(parsedMessage);
        } catch (error) {
          this.logger.error('Error parsing Redis message:', error);
        }
      }
    });
  }

  async onModuleDestroy() {
    if (this.publisher) {
      await this.publisher.quit();
    }
    if (this.subscriber) {
      await this.subscriber.quit();
    }
  }

  async publish(channel: string, message: any): Promise<void> {
    if (!this.isReady) {
      throw new Error('Redis is not ready yet');
    }

    await this.publisher.publish(channel, JSON.stringify(message));
  }

  async subscribe(
    channel: string,
    handler: (message: any) => void,
  ): Promise<void> {
    if (!this.isReady) {
      throw new Error('Redis is not ready yet');
    }
    this.messageHandlers.set(channel, handler);
    await this.subscriber.subscribe(channel);
  }

  async unsubscribe(channel: string): Promise<void> {
    if (!this.isReady) {
      return;
    }
    this.messageHandlers.delete(channel);
    await this.subscriber.unsubscribe(channel);
  }
}
