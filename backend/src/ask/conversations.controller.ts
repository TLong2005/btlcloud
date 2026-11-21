import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtPayload } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConversationsService } from './conversations.service';

const conversationIdPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException('Cuộc trò chuyện không hợp lệ'),
});

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.conversations.list(user.tenantId, user.sub);
  }

  @Get(':id')
  get(@CurrentUser() user: JwtPayload, @Param('id', conversationIdPipe) id: string) {
    return this.conversations.get(user.tenantId, user.sub, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: JwtPayload, @Param('id', conversationIdPipe) id: string) {
    return this.conversations.remove(user.tenantId, user.sub, id);
  }
}
