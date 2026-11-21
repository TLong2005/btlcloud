import { randomUUID } from 'crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';
import {
  DocumentJob,
  QueueService,
  ReceivedMessage,
  serializeJob,
} from './queue.service';

const WAIT_MS = 20_000;
const POLL_MS = 200;
const VISIBILITY_MS = 15 * 60_000;

interface StoredMessage {
  body: string;
  receiptHandle: string;
  receiveCount: number;
  visibleAt: number;
}

export class InMemoryQueueService implements QueueService {
  private readonly dir = path.resolve(process.cwd(), '.local-queue');
  private stopped = false;

  async enqueue(job: DocumentJob): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const receiptHandle = `${Date.now()}-${randomUUID()}`;
    const stored: StoredMessage = {
      body: serializeJob(job),
      receiptHandle,
      receiveCount: 0,
      visibleAt: 0,
    };
    await writeFile(this.filePath(receiptHandle), JSON.stringify(stored));
  }

  async receive(): Promise<ReceivedMessage | null> {
    const deadline = Date.now() + WAIT_MS;
    while (!this.stopped && Date.now() < deadline) {
      const message = await this.claim();
      if (message) {
        return message;
      }
      await sleep(Math.min(POLL_MS, Math.max(0, deadline - Date.now())));
    }
    return null;
  }

  async delete(receiptHandle: string): Promise<void> {
    await rm(this.filePath(receiptHandle), { force: true });
  }

  stop(): void {
    this.stopped = true;
  }

  private filePath(receiptHandle: string): string {
    if (!/^[\w.-]+$/.test(receiptHandle)) {
      throw new Error('Invalid receipt handle');
    }
    return path.join(this.dir, `${receiptHandle}.json`);
  }

  private async claim(): Promise<ReceivedMessage | null> {
    await mkdir(this.dir, { recursive: true });
    const names = (await readdir(this.dir))
      .filter((name) => name.endsWith('.json'))
      .sort();
    const now = Date.now();
    for (const name of names) {
      const full = path.join(this.dir, name);
      let stored: StoredMessage;
      try {
        stored = JSON.parse(await readFile(full, 'utf8')) as StoredMessage;
      } catch {
        continue;
      }
      if (!stored.receiptHandle || stored.visibleAt > now) {
        continue;
      }
      stored.receiveCount += 1;
      stored.visibleAt = now + VISIBILITY_MS;
      await writeFile(full, JSON.stringify(stored));
      return {
        body: stored.body,
        receiptHandle: stored.receiptHandle,
        receiveCount: stored.receiveCount,
      };
    }
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
