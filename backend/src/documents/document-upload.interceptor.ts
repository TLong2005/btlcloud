import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import multer from 'multer';
import { Observable } from 'rxjs';

@Injectable()
export class DocumentUploadInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const maxMb = this.config.get<number>('maxUploadMb') ?? 10;
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: maxMb * 1024 * 1024 },
      defParamCharset: 'utf8',
    }).single('file');

    return new Observable((subscriber) => {
      upload(request, response, (err: unknown) => {
        if (err) {
          subscriber.error(err);
          return;
        }
        next.handle().subscribe(subscriber);
      });
    });
  }
}
