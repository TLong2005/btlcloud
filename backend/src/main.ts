import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JsonLogger } from './logger/json-logger';

async function bootstrap(): Promise<void> {
  const logger = new JsonLogger();
  const app = await NestFactory.create(AppModule, { logger });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  const port = app.get(ConfigService).getOrThrow<number>('port');
  await app.listen(port);
  logger.log(`listening on ${port}`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(
    `${JSON.stringify({ level: 'error', time: new Date().toISOString(), message })}\n`,
  );
  process.exit(1);
});
