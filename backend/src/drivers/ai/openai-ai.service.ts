import { CHAT_MODELS } from '../../ask/chat-models';
import {
  AiService,
  assertEmbeddingModel,
  ChatRequest,
  EMBEDDING_DIMENSIONS,
  EmbedPurpose,
  Embedding,
} from './ai.service';

const CHAT_TIMEOUT_MS = 180_000;
const EMBED_TIMEOUT_MS = 30_000;

export class OpenAiService implements AiService {
  readonly embeddingModel: string;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly chatModel: string,
    private readonly embeddingModelId: string,
  ) {
    this.embeddingModel = `openai:${embeddingModelId}`;
  }

  async embed(text: string, _purpose?: EmbedPurpose, model?: string): Promise<Embedding> {
    assertEmbeddingModel(this, model);
    const payload = await this.post<{ data?: Array<{ embedding?: number[] }> }>(
      '/embeddings',
      {
        model: this.embeddingModelId,
        input: text,
        dimensions: EMBEDDING_DIMENSIONS,
      },
    );
    const embedding = payload.data?.[0]?.embedding;
    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error('OpenAI embedding response is invalid');
    }
    return { model: this.embeddingModel, vector: embedding };
  }

  async chat(request: ChatRequest): Promise<string> {
    let text = '';
    for await (const piece of this.chatStream(request)) {
      text += piece;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('OpenAI chat response is empty');
    }
    return trimmed;
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.resolveChatModel(request.model),
        stream: true,
        max_completion_tokens: 16384,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: this.userMessage(request) },
        ],
      }),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
    if (!response.ok || !response.body) {
      throw new Error(await openAiError(response));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const piece = deltaFromLine(line);
        if (piece) yield piece;
      }
    }
  }

  private resolveChatModel(requested?: string): string {
    if (requested && (CHAT_MODELS as readonly string[]).includes(requested)) {
      return requested;
    }
    return this.chatModel;
  }

  private userMessage(request: ChatRequest): string {
    const context = request.chunks
      .map((chunk, index) => `[${index + 1}] ${chunk.filename}\n${chunk.content}`)
      .join('\n\n');
    return `Ngữ cảnh:\n${context}\n\nCâu hỏi: ${request.question}`;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(await openAiError(response));
    }
    return (await response.json()) as T;
  }
}

async function openAiError(response: Response): Promise<string> {
  let detail = '';
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    detail = payload.error?.message?.trim() ?? '';
  } catch {
    detail = '';
  }
  if (response.status === 401) {
    return 'Khóa API mô hình không hợp lệ';
  }
  if (detail) {
    return `Nhà cung cấp mô hình từ chối yêu cầu: ${detail}`;
  }
  return `Nhà cung cấp mô hình trả về HTTP ${response.status}`;
}

function deltaFromLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return '';
  const data = trimmed.slice(5).trim();
  if (!data || data === '[DONE]') return '';
  try {
    const payload = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    return payload.choices?.[0]?.delta?.content ?? '';
  } catch {
    return '';
  }
}
