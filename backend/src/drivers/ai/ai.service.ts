export const AI_SERVICE = 'AI_SERVICE';

export const EMBEDDING_DIMENSIONS = 1024;

export type EmbedPurpose = 'document' | 'query';

export interface Embedding {
  model: string;
  vector: number[];
}

export interface ContextChunk {
  filename: string;
  content: string;
}

export interface ChatRequest {
  systemPrompt: string;
  question: string;
  chunks: ContextChunk[];
  model?: string;
}

export interface AiService {
  readonly embeddingModel: string;
  embed(text: string, purpose?: EmbedPurpose, model?: string): Promise<Embedding>;
  chat(request: ChatRequest): Promise<string>;
  chatStream?(request: ChatRequest): AsyncIterable<string>;
}

export function assertEmbeddingModel(service: AiService, model?: string): void {
  if (model && model !== service.embeddingModel) {
    throw new Error(`Embedding model ${model} is not configured`);
  }
}
