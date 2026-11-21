import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { QueueModule } from '../drivers/queue/queue.module';
import { StorageModule } from '../drivers/storage/storage.module';
import { DocumentUploadInterceptor } from './document-upload.interceptor';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [AuthModule, DatabaseModule, StorageModule, QueueModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentUploadInterceptor],
})
export class DocumentsModule {}
