import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InMemoryQueueService } from './inmemory-queue.service';
import { QUEUE_SERVICE, QueueService } from './queue.service';
import { SqsQueueService } from './sqs-queue.service';

@Module({
  providers: [
    {
      provide: QUEUE_SERVICE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): QueueService => {
        const driver = config.getOrThrow<'sqs' | 'inmemory'>('queueDriver');
        if (driver === 'sqs') {
          return new SqsQueueService(
            config.getOrThrow<string>('awsRegion'),
            config.getOrThrow<string>('sqsQueueUrl'),
          );
        }
        return new InMemoryQueueService();
      },
    },
  ],
  exports: [QUEUE_SERVICE],
})
export class QueueModule {}
