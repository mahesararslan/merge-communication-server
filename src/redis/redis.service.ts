import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
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
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    const redisPassword = this.configService.get<string>('REDIS_PASSWORD', '');

    const config = {
      host: redisHost,
      port: redisPort,
      ...(redisPassword && { password: redisPassword }),
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    };

    this.publisher = new Redis(config);
    this.subscriber = new Redis(config);

    // Wait for both connections to be ready
    await Promise.all([
      new Promise<void>((resolve) => {
        if (this.publisher.status === 'ready') {
          resolve();
        } else {
          this.publisher.once('ready', () => resolve());
        }
      }),
      new Promise<void>((resolve) => {
        if (this.subscriber.status === 'ready') {
          resolve();
        } else {
          this.subscriber.once('ready', () => resolve());
        }
      }),
    ]);

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

    this.isReady = true;
    this.logger.log('Redis connected successfully');
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

  async subscribe(channel: string, handler: (message: any) => void): Promise<void> {
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
