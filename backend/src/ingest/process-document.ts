import { randomUUID } from 'crypto';
import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { QueueDriver } from '../config/configuration';
import { DatabaseService } from '../database/database.service';
import { AiService, EMBEDDING_DIMENSIONS, Embedding } from '../drivers/ai/ai.service';
import { isThrottling } from '../drivers/ai/bedrock-ai.service';
import { QueueService, ReceivedMessage } from '../drivers/queue/queue.service';
import { StorageService } from '../drivers/storage/storage.service';
import { writeLog } from '../logger/json-logger';
import { chunkText } from './chunk-text';
import { extractText } from './extract-text';
import { parseMessage } from './parse-message';

const EMBED_CONCURRENCY = 3;
const EMBED_MAX_TRIES = 5;

export interface IngestDeps {
  db: DatabaseService;
  storage: StorageService;
  ai: AiService;
  queue: QueueService;
  workDir: string;
  maxReceiveCount: number;
  artificialDelayMs: number;
  queueDriver: QueueDriver;
}

interface DocumentRow {
  id: string;
  filename: string;
  s3_key: string;
  status: string;
  revision: number;
}

export async function processMessage(
  deps: IngestDeps,
  message: ReceivedMessage,
): Promise<void> {
  const parsed = parseMessage(message.body);
  if (parsed.kind === 'test-event') {
    await deps.queue.delete(message.receiptHandle);
    writeLog({ level: 'info', message: 'deleted s3 test event' });
    return;
  }
  if (parsed.kind === 'invalid') {
    writeLog({
      level: 'error',
      message: 'unreadable queue message',
      receiveCount: message.receiveCount,
    });
    if (
      deps.queueDriver === 'inmemory' &&
      message.receiveCount >= deps.maxReceiveCount
    ) {
      await deps.queue.delete(message.receiptHandle);
    }
    throw new Error('Unreadable queue message');
  }

  try {
    for (const job of parsed.jobs) {
      await processJob(deps, job, message.receiveCount);
    }
  } catch (err) {
    if (
      deps.queueDriver === 'inmemory' &&
      message.receiveCount >= deps.maxReceiveCount
    ) {
      await deps.queue.delete(message.receiptHandle);
    }
    throw err;
  }

  await deps.queue.delete(message.receiptHandle);
}

async function processJob(
  deps: IngestDeps,
  job: { documentId: string; tenantId: string; s3Key: string },
  receiveCount: number,
): Promise<void> {
  const started = Date.now();
  const claimed = await claimDocument(deps, job, started);
  if (!claimed) {
    return;
  }

  let tempPath: string | null = null;
  let chunkCount = 0;
  try {
    if (deps.artificialDelayMs > 0) {
      await sleep(deps.artificialDelayMs);
    }
    const bytes = await deps.storage.getObject(job.s3Key);
    await mkdir(deps.workDir, { recursive: true });
    tempPath = path.join(deps.workDir, `${job.documentId}-${randomUUID()}`);
    await writeFile(tempPath, bytes);

    const text = await extractText(tempPath, claimed.filename);
    const parts = chunkText(text);
    if (parts.length === 0) {
      throw new Error('Không trích xuất được nội dung văn bản');
    }

    const embedding = await deps.db.tenantQuery(
      job.tenantId,
      `UPDATE documents
       SET status = 'EMBEDDING'
       WHERE id = $1 AND tenant_id = $2 AND revision = $3 AND status = 'EXTRACTING'`,
      [job.documentId, job.tenantId, claimed.revision],
    );
    if ((embedding.rowCount ?? 0) === 0) {
      writeLog({
        level: 'info',
        message: 'document skipped',
        documentId: job.documentId,
        tenantId: job.tenantId,
        durationMs: Date.now() - started,
        chunkCount: 0,
        reason: 'replaced-or-deleted',
      });
      return;
    }

    const first = await embedWithRetry(deps.ai, `${claimed.filename}\n${parts[0]}`);
    const rest = await mapWithConcurrency(parts.slice(1), EMBED_CONCURRENCY, (content) =>
      embedWithRetry(deps.ai, `${claimed.filename}\n${content}`, first.model),
    );
    const embedded = [first, ...rest];
    chunkCount = embedded.length;

    const committed = await deps.db.asTenant(job.tenantId, async (query) => {
      const locked = await query<{ revision: number }>(
        `SELECT revision
         FROM documents
         WHERE id = $1 AND tenant_id = $2
         FOR UPDATE`,
        [job.documentId, job.tenantId],
      );
      const current = locked.rows[0];
      if (!current || Number(current.revision) !== claimed.revision) {
        return false;
      }
      await query(
        `DELETE FROM chunks WHERE document_id = $1 AND tenant_id = $2`,
        [job.documentId, job.tenantId],
      );
      for (let index = 0; index < parts.length; index++) {
        const embedding = embedded[index];
        if (embedding.vector.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(`Unexpected embedding size: ${embedding.vector.length}`);
        }
        await query(
          `INSERT INTO chunks
             (id, tenant_id, document_id, chunk_index, content, embedding, embedding_model)
           VALUES ($1, $2, $3, $4, $5, $6::vector, $7)`,
          [
            randomUUID(),
            job.tenantId,
            job.documentId,
            index,
            parts[index],
            toVector(embedding.vector),
            embedding.model,
          ],
        );
      }
      const updated = await query(
        `UPDATE documents
         SET status = 'READY', chunk_count = $3, error_message = NULL
         WHERE id = $1 AND tenant_id = $2 AND revision = $4`,
        [job.documentId, job.tenantId, parts.length, claimed.revision],
      );
      return (updated.rowCount ?? 0) > 0;
    });
    if (!committed) {
      writeLog({
        level: 'info',
        message: 'document skipped',
        documentId: job.documentId,
        tenantId: job.tenantId,
        durationMs: Date.now() - started,
        chunkCount: 0,
        reason: 'replaced-or-deleted',
      });
      return;
    }

    writeLog({
      level: 'info',
      message: 'document ready',
      documentId: job.documentId,
      tenantId: job.tenantId,
      durationMs: Date.now() - started,
      chunkCount,
    });
  } catch (err) {
    const stillOurs = await ownsRevision(deps, job, claimed.revision);
    if (!stillOurs) {
      writeLog({
        level: 'info',
        message: 'document skipped',
        documentId: job.documentId,
        tenantId: job.tenantId,
        durationMs: Date.now() - started,
        chunkCount,
        reason: 'replaced-or-deleted',
      });
      return;
    }
    if (receiveCount >= deps.maxReceiveCount) {
      try {
        await deps.db.tenantQuery(
          job.tenantId,
          `UPDATE documents
           SET status = 'FAILED', error_message = $3
           WHERE id = $1 AND tenant_id = $2 AND revision = $4 AND status <> 'READY'`,
          [job.documentId, job.tenantId, failureMessage(err), claimed.revision],
        );
      } catch (updateErr) {
        writeLog({
          level: 'error',
          message: updateErr instanceof Error ? updateErr.message : 'failed to mark FAILED',
          documentId: job.documentId,
          tenantId: job.tenantId,
        });
      }
    }
    writeLog({
      level: 'error',
      message: err instanceof Error ? err.message : 'Xử lý tài liệu thất bại',
      documentId: job.documentId,
      tenantId: job.tenantId,
      durationMs: Date.now() - started,
      chunkCount,
      receiveCount,
    });
    throw err;
  } finally {
    if (tempPath) {
      await rm(tempPath, { force: true });
      writeLog({
        level: 'info',
        message: `temp file removed ${tempPath}`,
        documentId: job.documentId,
        tenantId: job.tenantId,
      });
    }
  }
}

async function claimDocument(
  deps: IngestDeps,
  job: { documentId: string; tenantId: string; s3Key: string },
  started: number,
): Promise<{ filename: string; revision: number } | null> {
  const existing = await deps.db.tenantQuery<DocumentRow>(
    job.tenantId,
    `SELECT id, filename, s3_key, status, revision
     FROM documents
     WHERE id = $1 AND tenant_id = $2`,
    [job.documentId, job.tenantId],
  );
  const document = existing.rows[0];
  if (!document || document.status === 'READY' || document.s3_key !== job.s3Key) {
    writeLog({
      level: 'info',
      message: 'document skipped',
      documentId: job.documentId,
      tenantId: job.tenantId,
      durationMs: Date.now() - started,
      chunkCount: 0,
      reason: !document ? 'missing' : document.status === 'READY' ? 'ready' : 'stale-key',
    });
    return null;
  }

  const revision = Number(document.revision);
  const claimed = await deps.db.tenantQuery(
    job.tenantId,
    `UPDATE documents
     SET status = 'EXTRACTING', error_message = NULL
     WHERE id = $1 AND tenant_id = $2 AND revision = $3 AND status <> 'READY'`,
    [job.documentId, job.tenantId, revision],
  );
  if ((claimed.rowCount ?? 0) === 0) {
    writeLog({
      level: 'info',
      message: 'document skipped',
      documentId: job.documentId,
      tenantId: job.tenantId,
      durationMs: Date.now() - started,
      chunkCount: 0,
      reason: 'replaced-or-deleted',
    });
    return null;
  }
  return { filename: document.filename, revision };
}

async function ownsRevision(
  deps: IngestDeps,
  job: { documentId: string; tenantId: string },
  revision: number,
): Promise<boolean> {
  const current = await deps.db.tenantQuery<{ revision: number }>(
    job.tenantId,
    `SELECT revision FROM documents WHERE id = $1 AND tenant_id = $2`,
    [job.documentId, job.tenantId],
  );
  const row = current.rows[0];
  return Boolean(row) && Number(row.revision) === revision;
}

async function embedWithRetry(
  ai: AiService,
  content: string,
  model?: string,
): Promise<Embedding> {
  for (let attempt = 1; attempt <= EMBED_MAX_TRIES; attempt++) {
    try {
      return await ai.embed(content, 'document', model);
    } catch (err) {
      if (attempt === EMBED_MAX_TRIES || !isThrottling(err)) {
        throw err;
      }
      await sleep(200 * 2 ** (attempt - 1));
    }
  }
  throw new Error('Xử lý tài liệu thất bại');
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function toVector(values: number[]): string {
  return `[${values.join(',')}]`;
}

function failureMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : '';
  if (
    raw === 'Không trích xuất được nội dung văn bản' ||
    raw === 'Định dạng tệp không được hỗ trợ'
  ) {
    return raw;
  }
  return 'Xử lý tài liệu thất bại';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
