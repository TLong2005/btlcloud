import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { QUEUE_SERVICE, QueueService } from '../drivers/queue/queue.service';
import {
  documentStorageKey,
  replacementStorageKey,
  sanitizeFilename,
  STORAGE_SERVICE,
  StorageService,
} from '../drivers/storage/storage.service';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt']);

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain; charset=utf-8',
};

export interface DocumentView {
  id: string;
  filename: string;
  sizeBytes: number;
  status: string;
  errorMessage: string | null;
  chunkCount: number;
  createdAt: string;
}

export interface DocumentFile {
  filename: string;
  contentType: string;
  body: Buffer;
}

interface DocumentRow {
  id: string;
  filename: string;
  s3_key: string;
  size_bytes: string | number;
  status: string;
  error_message: string | null;
  chunk_count: number;
  created_at: Date | string;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Inject(QUEUE_SERVICE) private readonly queue: QueueService,
  ) {}

  async create(
    tenantId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ id: string; filename: string; status: 'UPLOADED' }> {
    const accepted = this.acceptFile(file);
    const id = randomUUID();
    const s3Key = documentStorageKey(tenantId, id, accepted.filename);
    await this.storage.putObject(s3Key, accepted.buffer, CONTENT_TYPES[accepted.extension]);
    await this.db.tenantQuery(tenantId,
      `INSERT INTO documents
         (id, tenant_id, filename, s3_key, size_bytes, status, error_message, chunk_count)
       VALUES ($1, $2, $3, $4, $5, 'UPLOADED', NULL, 0)`,
      [id, tenantId, accepted.filename, s3Key, accepted.size],
    );

    if (this.config.get<string>('storageDriver') === 'local') {
      await this.queue.enqueue({ documentId: id, tenantId, s3Key });
    }

    return { id, filename: accepted.filename, status: 'UPLOADED' };
  }

  async list(tenantId: string): Promise<DocumentView[]> {
    const result = await this.db.tenantQuery<DocumentRow>(
      tenantId,
      `SELECT id, filename, s3_key, size_bytes, status, error_message, chunk_count, created_at
       FROM documents
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
    );
    return result.rows.map(toDocumentView);
  }

  async get(tenantId: string, id: string): Promise<DocumentView> {
    return toDocumentView(await this.findOwned(tenantId, id));
  }

  async download(tenantId: string, id: string): Promise<DocumentFile> {
    const row = await this.findOwned(tenantId, id);
    const body = await this.storage.getObject(row.s3_key);
    const extension = extensionOf(row.filename);
    return {
      filename: row.filename,
      contentType: CONTENT_TYPES[extension] ?? 'application/octet-stream',
      body,
    };
  }

  async rename(tenantId: string, id: string, filename: string): Promise<DocumentView> {
    const row = await this.findOwned(tenantId, id);
    const cleaned = sanitizeFilename(filename);
    const extension = extensionOf(cleaned);
    const currentExtension = extensionOf(row.filename);
    if (!ALLOWED_EXTENSIONS.has(extension) || extension !== currentExtension) {
      throw new BadRequestException(
        `Tên tệp phải giữ đuôi ${currentExtension || 'gốc'}`,
      );
    }
    const result = await this.db.tenantQuery<DocumentRow>(
      tenantId,
      `UPDATE documents
       SET filename = $3
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, filename, s3_key, size_bytes, status, error_message, chunk_count, created_at`,
      [id, tenantId, cleaned],
    );
    const updated = result.rows[0];
    if (!updated) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }
    return toDocumentView(updated);
  }

  async replace(
    tenantId: string,
    id: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ id: string; filename: string; status: 'UPLOADED' }> {
    const row = await this.findOwned(tenantId, id);
    const accepted = this.acceptFile(file);
    const s3Key = replacementStorageKey(tenantId, id, accepted.filename, randomUUID());
    await this.db.asTenant(tenantId, async (query) => {
      await query(
        `DELETE FROM chunks WHERE document_id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
      const updated = await query(
        `UPDATE documents
         SET filename = $3,
             s3_key = $4,
             size_bytes = $5,
             status = 'UPLOADED',
             error_message = NULL,
             chunk_count = 0,
             revision = revision + 1
         WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId, accepted.filename, s3Key, accepted.size],
      );
      if ((updated.rowCount ?? 0) === 0) {
        throw new NotFoundException('Không tìm thấy tài liệu');
      }
    });

    try {
      await this.storage.putObject(s3Key, accepted.buffer, CONTENT_TYPES[accepted.extension]);
    } catch (err) {
      await this.db.tenantQuery(tenantId,
        `UPDATE documents
         SET status = 'FAILED', error_message = $3
         WHERE id = $1 AND tenant_id = $2 AND s3_key = $4`,
        [id, tenantId, 'Không ghi được tệp mới', s3Key],
      );
      throw err;
    }

    if (row.s3_key !== s3Key) {
      await this.storage.deleteObject(row.s3_key);
    }
    if (this.config.get<string>('storageDriver') === 'local') {
      await this.queue.enqueue({ documentId: id, tenantId, s3Key });
    }
    return { id, filename: accepted.filename, status: 'UPLOADED' };
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const row = await this.findOwned(tenantId, id);
    await this.storage.deleteObject(row.s3_key);
    await this.db.asTenant(tenantId, async (query) => {
      await query(
        `DELETE FROM chunks WHERE document_id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
      const deleted = await query(
        `DELETE FROM documents WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
      if ((deleted.rowCount ?? 0) === 0) {
        throw new NotFoundException('Không tìm thấy tài liệu');
      }
    });
  }

  private acceptFile(file: Express.Multer.File | undefined): {
    filename: string;
    extension: string;
    size: number;
    buffer: Buffer;
  } {
    if (!file || !file.buffer) {
      throw new BadRequestException('Vui lòng chọn tệp để tải lên');
    }
    const filename = sanitizeFilename(file.originalname || '');
    const extension = extensionOf(filename);
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException('Chỉ chấp nhận tệp .pdf, .docx hoặc .txt');
    }
    if (file.size <= 0) {
      throw new BadRequestException('Tệp trống');
    }
    const maxMb = this.config.get<number>('maxUploadMb') ?? 10;
    if (file.size > maxMb * 1024 * 1024) {
      throw new BadRequestException(`Tệp vượt quá dung lượng tối đa ${maxMb}MB`);
    }
    return { filename, extension, size: file.size, buffer: file.buffer };
  }

  private async findOwned(tenantId: string, id: string): Promise<DocumentRow> {
    if (!isUuid(id)) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }
    const result = await this.db.tenantQuery<DocumentRow>(
      tenantId,
      `SELECT id, filename, s3_key, size_bytes, status, error_message, chunk_count, created_at
       FROM documents
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }
    return row;
  }
}

function toDocumentView(row: DocumentRow): DocumentView {
  return {
    id: row.id,
    filename: row.filename,
    sizeBytes: Number(row.size_bytes),
    status: row.status,
    errorMessage: row.error_message,
    chunkCount: row.chunk_count,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function extensionOf(filename: string): string {
  const index = filename.lastIndexOf('.');
  if (index <= 0) {
    return '';
  }
  return filename.slice(index).toLowerCase();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
