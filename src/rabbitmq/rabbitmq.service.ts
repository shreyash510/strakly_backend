import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';

@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: amqplib.ChannelModel | null = null;
  private channel: amqplib.Channel | null = null;
  private readonly url: string;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private consumers: Array<{
    queue: string;
    handler: (msg: Record<string, any>) => Promise<void>;
  }> = [];

  constructor(private readonly configService: ConfigService) {
    this.url = this.configService.get<string>('CLOUDAMQP_URL') || '';
  }

  async onModuleInit(): Promise<void> {
    if (!this.url) {
      this.logger.warn('CLOUDAMQP_URL not configured - RabbitMQ disabled');
      return;
    }
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    await this.close();
  }

  private async connect(): Promise<void> {
    try {
      this.connection = await amqplib.connect(this.url);
      this.channel = await this.connection.createChannel();

      this.connection.on('error', (err: Error) => {
        this.logger.error(`RabbitMQ connection error: ${err.message}`);
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.channel = null;
        this.connection = null;
        if (!this.isShuttingDown) {
          this.scheduleReconnect();
        }
      });

      this.logger.log('Connected to RabbitMQ');

      // Re-register consumers after reconnect
      for (const { queue, handler } of this.consumers) {
        await this.setupConsumer(queue, handler);
      }
    } catch (error: any) {
      this.logger.error(`Failed to connect to RabbitMQ: ${error.message}`);
      this.channel = null;
      this.connection = null;
      if (!this.isShuttingDown) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectTimeout = setTimeout(async () => {
      this.logger.log('Attempting to reconnect to RabbitMQ...');
      await this.connect();
    }, 5000);
  }

  private async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
    } catch (err: any) {
      this.logger.error(`Error closing channel: ${err.message}`);
    }
    try {
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
    } catch (err: any) {
      this.logger.error(`Error closing connection: ${err.message}`);
    }
  }

  async publish(queue: string, message: Record<string, any>): Promise<void> {
    try {
      if (!this.channel) {
        this.logger.warn(`Cannot publish to ${queue}: not connected`);
        return;
      }
      await this.channel.assertQueue(queue, { durable: true });
      this.channel.sendToQueue(
        queue,
        Buffer.from(JSON.stringify(message)),
        { persistent: true },
      );
    } catch (error: any) {
      this.logger.error(`Failed to publish to ${queue}: ${error.message}`);
    }
  }

  async consume(
    queue: string,
    handler: (msg: Record<string, any>) => Promise<void>,
  ): Promise<void> {
    // Store consumer for re-registration on reconnect
    this.consumers.push({ queue, handler });
    await this.setupConsumer(queue, handler);
  }

  private async setupConsumer(
    queue: string,
    handler: (msg: Record<string, any>) => Promise<void>,
  ): Promise<void> {
    if (!this.channel) {
      this.logger.warn(`Cannot consume from ${queue}: not connected`);
      return;
    }
    await this.channel.assertQueue(queue, { durable: true });
    await this.channel.prefetch(1);
    this.channel.consume(queue, async (msg) => {
      if (!msg) return;
      try {
        const content = JSON.parse(msg.content.toString());
        await handler(content);
      } catch (error: any) {
        this.logger.error(
          `Error processing message from ${queue}: ${error.message}`,
        );
      } finally {
        this.channel?.ack(msg);
      }
    });
    this.logger.log(`Consuming from queue: ${queue}`);
  }

  isConnected(): boolean {
    return this.channel !== null;
  }
}
