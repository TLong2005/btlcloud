import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtPayload } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AskService } from './ask.service';
import { AskDto } from './dto/ask.dto';

@Controller('ask')
@UseGuards(JwtAuthGuard)
export class AskController {
  constructor(private readonly askService: AskService) {}

  @Post()
  async ask(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AskDto,
    @Res() res: Response,
  ) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      for await (const event of this.askService.stream(
        user.tenantId,
        user.sub,
        dto.question,
        dto.model,
        dto.conversationId,
      )) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể gửi câu hỏi';
      res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    }
    res.end();
  }
}
