import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { QueueDriver } from './config/configuration';
import { DatabaseService } from './database/database.service';
import { AI_SERVICE, AiService } from './drivers/ai/ai.service';
import { QUEUE_SERVICE, QueueService, ReceivedMessage } from './drivers/queue/queue.service';
import { STORAGE_SERVICE, StorageService } from './drivers/storage/storage.service';
import { IngestDeps, processMessage } from './ingest/process-document';
import { JsonLogger, writeLog } from './logger/json-logger';

async function main(): Promise<void> {
  const logger = new JsonLogger();
  const app = await NestFactory.createApplicationContext(AppModule, { logger });
  const config = app.get(ConfigService);
  const deps: IngestDeps = {
    db: app.get(DatabaseService),
    storage: app.get<StorageService>(STORAGE_SERVICE),
    ai: app.get<AiService>(AI_SERVICE),
    queue: app.get<QueueService>(QUEUE_SERVICE),
    workDir: config.getOrThrow<string>('workDir'),
    maxReceiveCount: config.getOrThrow<number>('maxReceiveCount'),
    artificialDelayMs: config.getOrThrow<number>('workerArtificialDelayMs'),
    queueDriver: config.getOrThrow<QueueDriver>('queueDriver'),
  };

  let stop = false;
  const requestStop = () => {
    stop = true;
    deps.queue.stop();
  };
  process.on('SIGTERM', requestStop);
  process.on('SIGINT', requestStop);

  writeLog({ level: 'info', message: 'worker started', queueDriver: deps.queueDriver });

  while (!stop) {
    let message: ReceivedMessage | null = null;
    try {
      message = await deps.queue.receive();
    } catch (err) {
      if (stop) {
        break;
      }
      writeLog({
        level: 'error',
        message: err instanceof Error ? err.message : 'receive failed',
      });
      await sleep(1000);
      continue;
    }
    if (!message) {
      continue;
    }
    try {
      await processMessage(deps, message);
    } catch {}
  }

  await app.close();
  writeLog({ level: 'info', message: 'worker stopped' });
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(
    `${JSON.stringify({ level: 'error', time: new Date().toISOString(), message })}\n`,
  );
  process.exit(1);
});
