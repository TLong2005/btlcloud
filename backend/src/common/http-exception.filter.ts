import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { MulterError } from 'multer';

@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof MulterError) {
      const maxMb = this.config.get<number>('maxUploadMb') ?? 10;
      const message =
        exception.code === 'LIMIT_FILE_SIZE'
          ? `Tệp vượt quá dung lượng tối đa ${maxMb}MB`
          : 'Tệp tải lên không hợp lệ';
      response.status(400).json({ statusCode: 400, message });
      return;
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      response.status(statusCode).json({
        statusCode,
        message: exceptionMessage(exception),
      });
      return;
    }

    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    response.status(500).json({ statusCode: 500, message: 'Lỗi máy chủ' });
  }
}

function exceptionMessage(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'string') {
    return body;
  }
  if (typeof body === 'object' && body && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) {
      return message.map(String).join(' ');
    }
    if (typeof message === 'string') {
      return message;
    }
  }
  return exception.message;
}
