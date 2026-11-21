import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AskModule } from './ask/ask.module';
import { AuthModule } from './auth/auth.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { loadConfig } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { AiModule } from './drivers/ai/ai.module';
import { QueueModule } from './drivers/queue/queue.module';
import { StorageModule } from './drivers/storage/storage.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [loadConfig],
    }),
    DatabaseModule,
    StorageModule,
    QueueModule,
    AiModule,
    AuthModule,
    DocumentsModule,
    AskModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
