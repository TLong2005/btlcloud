import { writeLog } from '../../logger/json-logger';
import { AiService, ChatRequest, EmbedPurpose, Embedding } from './ai.service';

const PRIMARY_COOLDOWN_MS = 60_000;

export class FallbackAiService implements AiService {
  readonly embeddingModel: string;
  private primaryDownUntil = 0;

  constructor(
    private readonly primary: AiService,
    private readonly secondary: AiService,
  ) {
    this.embeddingModel = primary.embeddingModel;
  }

  async embed(text: string, purpose?: EmbedPurpose, model?: string): Promise<Embedding> {
    if (model === this.secondary.embeddingModel) {
      return this.secondary.embed(text, purpose, model);
    }
    if (model === this.primary.embeddingModel) {
      return this.primary.embed(text, purpose, model);
    }
    if (model) {
      throw new Error(`Embedding model ${model} is not configured`);
    }
    if (this.primaryAvailable()) {
      try {
        return await this.primary.embed(text, purpose);
      } catch (err) {
        this.markPrimaryDown('embed', err);
      }
    }
    return this.secondary.embed(text, purpose);
  }

  async chat(request: ChatRequest): Promise<string> {
    if (this.primaryAvailable()) {
      try {
        return await this.primary.chat(request);
      } catch (err) {
        this.markPrimaryDown('chat', err);
      }
    }
    return this.secondary.chat(request);
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string> {
    if (this.primaryAvailable()) {
      let produced = false;
      try {
        for await (const piece of streamFrom(this.primary, request)) {
          produced = true;
          yield piece;
        }
        return;
      } catch (err) {
        if (produced) throw err;
        this.markPrimaryDown('chat', err);
      }
    }
    yield* streamFrom(this.secondary, request);
  }

  private primaryAvailable(): boolean {
    return Date.now() >= this.primaryDownUntil;
  }

  private markPrimaryDown(operation: string, err: unknown): void {
    this.primaryDownUntil = Date.now() + PRIMARY_COOLDOWN_MS;
    writeLog({
      level: 'warn',
      message: 'primary AI provider failed, using fallback',
      operation,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  }
}

async function* streamFrom(service: AiService, request: ChatRequest): AsyncGenerator<string> {
  if (service.chatStream) {
    yield* service.chatStream(request);
    return;
  }
  yield await service.chat(request);
}
