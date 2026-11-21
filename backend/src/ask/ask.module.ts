import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { AiModule } from '../drivers/ai/ai.module';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [AuthModule, DatabaseModule, AiModule],
  controllers: [AskController, ConversationsController],
  providers: [AskService, ConversationsService],
})
export class AskModule {}
