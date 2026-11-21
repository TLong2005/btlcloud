import { BadGatewayException, HttpException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { AI_SERVICE, AiService, EMBEDDING_DIMENSIONS } from '../drivers/ai/ai.service';
import { ConversationsService } from './conversations.service';

const INSUFFICIENT_ANSWER =
  'Không tìm thấy đủ thông tin trong tài liệu của doanh nghiệp bạn.';

const SYSTEM_PROMPT = [
  'Bạn là trợ lý hỏi đáp tài liệu nội bộ.',
  'Chỉ trả lời bằng tiếng Việt.',
  'Chỉ dùng ngữ cảnh được cung cấp, không dùng kiến thức bên ngoài.',
  'Khi trả lời, nêu tên tệp nguồn.',
  'Nếu ngữ cảnh có nhiều tệp, hãy nói từng tệp được hỏi, không bỏ sót tệp nào.',
  'Viết văn thường, không dùng markdown, không dùng dấu **.',
  'Nếu ngữ cảnh không đủ để trả lời, hãy nói rõ là không đủ thông tin.',
].join('\n');

const ORDER_PROMPT = [
  'Bạn là trợ lý hỏi đáp tài liệu nội bộ.',
  'Chỉ trả lời bằng tiếng Việt.',
  'Các đoạn được xếp theo đúng thứ tự từ đầu tệp. Mỗi đoạn là một khối chữ, không phải một slide.',
  'Trình bày đầy đủ lần lượt từng đoạn. Không rút gọn, không bỏ đoạn, không dừng giữa chừng.',
  'Chỉ gọi là trang hoặc slide khi đoạn văn tự ghi số đó.',
  'Không được nói một phần không có nội dung chỉ vì không thấy số thứ tự.',
  'Nêu tên tệp nguồn.',
  'Viết văn thường, không dùng markdown, không dùng dấu **.',
].join('\n');

const MODEL_ERROR = 'Không gọi được mô hình ngôn ngữ. Vui lòng thử lại sau.';

const ASSISTANT_PROMPT = [
  'Bạn là trợ lý tài liệu nội bộ, nói chuyện tự nhiên bằng tiếng Việt.',
  'Chỉ dùng danh sách tài liệu được cung cấp, không bịa thêm tên tệp.',
  'Nếu người dùng chào hoặc hỏi bạn làm được gì, hãy chào lại và nói bạn trả lời dựa trên các tài liệu đó.',
  'Nếu họ hỏi hiện có tài liệu nào, hãy liệt kê tên tệp và trạng thái bằng văn thường, không dùng markdown.',
  'Nếu danh sách trống, hãy nói chưa có tài liệu và gợi ý quản trị viên tải lên.',
].join('\n');

const STATUS_LABEL: Record<string, string> = {
  UPLOADED: 'Đã tải lên',
  PROCESSING: 'Đang xử lý',
  READY: 'Sẵn sàng',
  FAILED: 'Lỗi',
};

export interface AskSource {
  documentId: string;
  filename: string;
  snippet: string;
  score: number;
}

export interface AskResponse {
  answer: string;
  insufficientData: boolean;
  sources: AskSource[];
}

export type AskStreamEvent =
  | { type: 'conversation'; id: string; title: string }
  | { type: 'meta'; insufficientData: boolean; sources: AskSource[] }
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

interface ChunkRow {
  document_id: string;
  filename: string;
  content: string;
  similarity: number | string;
}

@Injectable()
export class AskService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    @Inject(AI_SERVICE) private readonly ai: AiService,
    private readonly conversations: ConversationsService,
  ) {}

  async *stream(
    tenantId: string,
    userId: string,
    question: string,
    model?: string,
    conversationId?: string,
  ): AsyncGenerator<AskStreamEvent> {
    let opened: { id: string; title: string; created: boolean };
    try {
      opened = await this.conversations.open(tenantId, userId, conversationId, question);
    } catch (err) {
      yield { type: 'error', message: errorText(err) };
      return;
    }

    yield { type: 'conversation', id: opened.id, title: opened.title };

    let answer = '';
    let sources: AskSource[] = [];
    let insufficientData = false;
    let failed = false;

    try {
      for await (const event of this.answerStream(tenantId, question, model)) {
        if (event.type === 'done') continue;
        if (event.type === 'error') {
          failed = true;
          yield event;
          break;
        }
        if (event.type === 'delta') answer += event.text;
        if (event.type === 'meta') {
          sources = event.sources;
          insufficientData = event.insufficientData;
        }
        yield event;
      }

      if (failed) {
        if (opened.created) {
          await this.conversations.removeIfEmpty(tenantId, userId, opened.id).catch(() => undefined);
        }
        return;
      }

      await this.conversations.appendTurn({
        conversationId: opened.id,
        tenantId,
        userId,
        question,
        answer,
        model,
        insufficientData,
        sources,
      });
    } catch (err) {
      if (opened.created) {
        await this.conversations.removeIfEmpty(tenantId, userId, opened.id).catch(() => undefined);
      }
      yield { type: 'error', message: errorText(err) };
      return;
    }

    yield { type: 'done' };
  }

  private async *answerStream(
    tenantId: string,
    question: string,
    model?: string,
  ): AsyncGenerator<AskStreamEvent> {
    if (isAssistantQuestion(question)) {
      yield* this.streamAssistant(tenantId, question, model);
      return;
    }

    const ordered = openingRequest(question);
    let matches: ChunkRow[];
    try {
      matches = ordered
        ? await this.loadOpeningChunks(tenantId, question, ordered.count)
        : await this.retrieveChunks(tenantId, question);
      if (ordered && matches.length === 0) {
        matches = await this.retrieveChunks(tenantId, question);
      }
    } catch (err) {
      yield { type: 'error', message: errorText(err) };
      return;
    }

    if (matches.length === 0) {
      yield { type: 'meta', insufficientData: true, sources: [] };
      yield { type: 'delta', text: INSUFFICIENT_ANSWER };
      yield { type: 'done' };
      return;
    }

    const sources = matches.map((row) => ({
      documentId: row.document_id,
      filename: row.filename,
      snippet: row.content.replace(/\s+/g, ' ').trim().slice(0, 200),
      score: Number(row.similarity),
    }));
    yield { type: 'meta', insufficientData: false, sources };

    try {
      yield* this.streamChat({
        systemPrompt: ordered ? ORDER_PROMPT : SYSTEM_PROMPT,
        question,
        model,
        chunks: matches.map((row) => ({
          filename: row.filename,
          content: row.content,
        })),
      });
    } catch (err) {
      yield { type: 'error', message: errorText(err) };
      return;
    }
    yield { type: 'done' };
  }

  async ask(
    tenantId: string,
    userId: string,
    question: string,
    model?: string,
    conversationId?: string,
  ): Promise<AskResponse> {
    let insufficientData = false;
    let sources: AskSource[] = [];
    let answer = '';
    for await (const event of this.stream(tenantId, userId, question, model, conversationId)) {
      if (event.type === 'meta') {
        insufficientData = event.insufficientData;
        sources = event.sources;
      } else if (event.type === 'delta') {
        answer += event.text;
      } else if (event.type === 'error') {
        throw new BadGatewayException(event.message);
      }
    }
    return { answer, insufficientData, sources };
  }

  private async *streamAssistant(
    tenantId: string,
    question: string,
    model?: string,
  ): AsyncGenerator<AskStreamEvent> {
    let catalog = 'Chưa có tài liệu nào.';
    try {
      const result = await this.db.query<{ filename: string; status: string }>(
        `SELECT filename, status
         FROM documents
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId],
      );
      if (result.rows.length > 0) {
        catalog = result.rows
          .map((row) => `- ${row.filename} (${STATUS_LABEL[row.status] ?? row.status})`)
          .join('\n');
      }
    } catch (err) {
      yield { type: 'error', message: errorText(err) };
      return;
    }

    yield { type: 'meta', insufficientData: false, sources: [] };
    try {
      yield* this.streamChat({
        systemPrompt: ASSISTANT_PROMPT,
        question,
        model,
        chunks: [{ filename: 'Danh sách tài liệu', content: catalog }],
      });
    } catch (err) {
      yield { type: 'error', message: errorText(err) };
      return;
    }
    yield { type: 'done' };
  }

  private async *streamChat(request: {
    systemPrompt: string;
    question: string;
    model?: string;
    chunks: { filename: string; content: string }[];
  }): AsyncGenerator<AskStreamEvent> {
    if (this.ai.chatStream) {
      for await (const text of this.ai.chatStream(request)) {
        if (text) yield { type: 'delta', text };
      }
      return;
    }
    yield { type: 'delta', text: await this.ai.chat(request) };
  }

  private async loadOpeningChunks(
    tenantId: string,
    question: string,
    count: number,
  ): Promise<ChunkRow[]> {
    const result = await this.db.query<ChunkRow>(
      `SELECT c.document_id, c.content, d.filename, 1 AS similarity
       FROM chunks c
       JOIN documents d
         ON d.id = c.document_id
        AND d.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1
         AND d.status = 'READY'
         AND c.document_id = (
           SELECT id
           FROM documents
           WHERE tenant_id = $1
             AND status = 'READY'
             AND (
               cardinality($2::text[]) = 0
               OR filename ILIKE ANY ($2::text[])
             )
           ORDER BY filename
           LIMIT 1
         )
       ORDER BY c.chunk_index
       LIMIT $3`,
      [tenantId, filenamePatterns(question), count * 4],
    );
    const readable = result.rows.filter((row) => !NOISE.test(row.content));
    const pool = readable.length > 0 ? readable : result.rows;
    return pool.slice(0, count);
  }

  private async retrieveChunks(tenantId: string, question: string): Promise<ChunkRow[]> {
    const threshold = this.config.get<number>('similarityThreshold') ?? 0.3;
    const patterns = filenamePatterns(question);
    const rows = await this.searchEveryModel(tenantId, question, patterns);
    const above = rows.filter((row) => Number(row.similarity) >= threshold);
    const namedFile = patterns.length > 0;
    const several = asksAboutSeveral(question);
    const pool = namedFile || several ? (above.length > 0 ? mergeDocumentChunks(above, rows) : rows) : above;
    const picked = chooseChunks(pool);
    if (picked.length > 0) return picked;
    if (isContentQuestion(question)) return this.loadReadyChunks(tenantId, question);
    return [];
  }

  private async searchEveryModel(
    tenantId: string,
    question: string,
    patterns: string[],
  ): Promise<ChunkRow[]> {
    const models = await this.db.query<{ embedding_model: string }>(
      `SELECT DISTINCT c.embedding_model
       FROM chunks c
       JOIN documents d
         ON d.id = c.document_id
        AND d.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1
         AND d.status = 'READY'`,
      [tenantId],
    );
    const rows: ChunkRow[] = [];
    let searched = 0;
    let lastError: unknown;
    for (const { embedding_model: model } of models.rows) {
      let vector: string;
      try {
        vector = toVector(await this.embed(question, model || undefined));
      } catch (err) {
        lastError = err;
        continue;
      }
      searched++;
      rows.push(...(await this.searchChunks(tenantId, vector, patterns, model)));
    }
    if (models.rows.length > 0 && searched === 0) {
      throw lastError;
    }
    return rows.sort((a, b) => Number(b.similarity) - Number(a.similarity));
  }

  private async searchChunks(
    tenantId: string,
    vector: string,
    patterns: string[],
    model: string,
  ): Promise<ChunkRow[]> {
    const result = await this.db.query<ChunkRow>(
      `SELECT document_id, filename, content, similarity
       FROM (
         SELECT c.document_id, c.content, d.filename,
                (1 - (c.embedding <=> $2::vector)) AS similarity,
                row_number() OVER (
                  PARTITION BY c.document_id
                  ORDER BY c.embedding <=> $2::vector
                ) AS rn
         FROM chunks c
         JOIN documents d
           ON d.id = c.document_id
          AND d.tenant_id = c.tenant_id
         WHERE c.tenant_id = $1
           AND d.status = 'READY'
           AND c.embedding_model = $4
           AND (
             cardinality($3::text[]) = 0
             OR d.filename ILIKE ANY ($3::text[])
           )
       ) ranked
       WHERE rn <= 20
       ORDER BY similarity DESC`,
      [tenantId, vector, patterns, model],
    );
    return result.rows;
  }

  private async loadReadyChunks(tenantId: string, question: string): Promise<ChunkRow[]> {
    const result = await this.db.query<ChunkRow>(
      `SELECT c.document_id, c.content, d.filename, 1 AS similarity
       FROM chunks c
       JOIN documents d
         ON d.id = c.document_id
        AND d.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1
         AND d.status = 'READY'
       ORDER BY d.created_at DESC, c.chunk_index
       LIMIT 12`,
      [tenantId],
    );
    const named = result.rows.filter((row) =>
      question.toLowerCase().includes(row.filename.toLowerCase()),
    );
    return named.length > 0 ? named : result.rows;
  }

  private async embed(question: string, model?: string): Promise<number[]> {
    try {
      const embedding = await this.ai.embed(question, 'query', model);
      if (embedding.vector.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Unexpected embedding size: ${embedding.vector.length}`);
      }
      return embedding.vector;
    } catch (err) {
      if (err instanceof BadGatewayException) {
        throw err;
      }
      throw new BadGatewayException(MODEL_ERROR);
    }
  }
}

function isContentQuestion(question: string): boolean {
  return /nói về|tóm tắt|tóm lược|nội dung|ý chính|trình bày|giải thích|quy trình|như thế nào|là gì|đọc giúp|viết về/.test(
    question.trim().toLowerCase(),
  );
}

function isAssistantQuestion(question: string): boolean {
  const text = question.trim().toLowerCase();
  if (isContentQuestion(text)) return false;
  if (/^(hi+|hello|hey|alo|ê|chào|xin chào)[!.?\s]*$/.test(text)) return true;
  if (/bạn (là ai|làm được gì|giúp được gì|có thể làm gì)/.test(text)) return true;
  return (
    /tài liệu|tệp|file/.test(text) &&
    /(nào|bao nhiêu|danh sách|có những|có các|hiện có|đang có|hiện tại có)/.test(text)
  );
}

function toVector(values: number[]): string {
  return `[${values.join(',')}]`;
}

const NOISE = /studeersnel|studocu|lomoarcpsd|scan to open/i;

function openingRequest(question: string): { count: number } | null {
  const text = question.toLowerCase();
  const numbered = text.match(/(\d+)\s*(?:slide|trang)\s*(?:đầu|đầu tiên)?/);
  if (numbered && /đầu|mở đầu/.test(text)) {
    return { count: Math.min(Math.max(Number(numbered[1]), 1), 12) };
  }
  if (/slide đầu|trang đầu|phần đầu|mở đầu/.test(text)) {
    return { count: 8 };
  }
  return null;
}

function filenamePatterns(question: string): string[] {
  const numbers = new Set<number>();
  for (const match of question.matchAll(/module\s*[_-]?\s*0*(\d+)/gi)) {
    numbers.add(Number(match[1]));
  }
  const patterns: string[] = [];
  for (const number of numbers) {
    patterns.push(
      `%module${number}%`,
      `%module_${number}%`,
      `%module-${number}%`,
      `%module_0${number}%`,
      `%module0${number}%`,
    );
  }
  return patterns;
}

function asksAboutSeveral(question: string): boolean {
  return /các module|những module|từng module|cả hai|các tài liệu|mỗi module|module đó/.test(
    question.toLowerCase(),
  );
}

function mergeDocumentChunks(preferred: ChunkRow[], fallback: ChunkRow[]): ChunkRow[] {
  const seen = new Set(preferred.map((row) => row.document_id));
  const extras = fallback.filter((row) => !seen.has(row.document_id));
  return [...preferred, ...extras];
}

function chooseChunks(rows: ChunkRow[]): ChunkRow[] {
  const groups = new Map<string, ChunkRow[]>();
  for (const row of rows) {
    const list = groups.get(row.document_id) ?? [];
    list.push(row);
    groups.set(row.document_id, list);
  }
  const kept: ChunkRow[] = [];
  for (const list of groups.values()) {
    const readable = list.filter((row) => !NOISE.test(row.content));
    kept.push(...(readable.length > 0 ? readable : list));
  }
  return diversify(kept, 6, 24);
}

function diversify(rows: ChunkRow[], perDocument: number, max: number): ChunkRow[] {
  const groups = new Map<string, ChunkRow[]>();
  for (const row of rows) {
    const list = groups.get(row.document_id) ?? [];
    if (list.length < perDocument) {
      list.push(row);
      groups.set(row.document_id, list);
    }
  }
  const picked: ChunkRow[] = [];
  const lists = [...groups.values()];
  for (let index = 0; picked.length < max && lists.some((list) => list.length > index); index += 1) {
    for (const list of lists) {
      const row = list[index];
      if (row && picked.length < max) picked.push(row);
    }
  }
  return picked;
}

function errorText(err: unknown): string {
  if (err instanceof HttpException) {
    const body = err.getResponse();
    if (typeof body === 'string') return body;
    if (body && typeof body === 'object' && 'message' in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === 'string') return message;
    }
  }
  return MODEL_ERROR;
}
