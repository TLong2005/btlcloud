import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  AiService,
  assertEmbeddingModel,
  ChatRequest,
  EMBEDDING_DIMENSIONS,
  EmbedPurpose,
  Embedding,
} from './ai.service';

const RETRY_DELAYS_MS = [250, 750, 1500, 3000];

export class BedrockAiService implements AiService {
  readonly embeddingModel: string;
  private readonly client: BedrockRuntimeClient;

  constructor(
    region: string,
    private readonly embeddingModelId: string,
    private readonly chatModelId: string,
  ) {
    this.client = new BedrockRuntimeClient({ region });
    this.embeddingModel = `bedrock:${embeddingModelId}`;
  }

  async embed(
    text: string,
    purpose: EmbedPurpose = 'document',
    model?: string,
  ): Promise<Embedding> {
    assertEmbeddingModel(this, model);
    const cohere = this.embeddingModelId.startsWith('cohere.');
    return this.withThrottleRetry(async () => {
      const response = await this.client.send(
        new InvokeModelCommand({
          modelId: this.embeddingModelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify(
            cohere
              ? {
                  texts: [text],
                  input_type:
                    purpose === 'query' ? 'search_query' : 'search_document',
                  truncate: 'END',
                }
              : {
                  inputText: text,
                  dimensions: EMBEDDING_DIMENSIONS,
                  normalize: true,
                },
          ),
        }),
      );
      if (!response.body) {
        throw new Error('Empty embedding response');
      }
      const payload = JSON.parse(Buffer.from(response.body).toString('utf8')) as {
        embedding?: number[];
        embeddings?: number[][];
      };
      const embedding = cohere ? payload.embeddings?.[0] : payload.embedding;
      if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Unexpected embedding size: ${embedding?.length ?? 0}`);
      }
      return { model: this.embeddingModel, vector: embedding };
    });
  }

  async chat(request: ChatRequest): Promise<string> {
    let text = '';
    for await (const piece of this.chatStream(request)) {
      text += piece;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Empty chat response');
    }
    return trimmed;
  }

  async *chatStream(request: ChatRequest): AsyncGenerator<string> {
    const response = await this.withThrottleRetry(() =>
      this.client.send(
        new ConverseStreamCommand({
          modelId: this.chatModelId,
          system: [{ text: request.systemPrompt }],
          messages: [
            {
              role: 'user',
              content: [{ text: userMessage(request) }],
            },
          ],
          inferenceConfig: {
            maxTokens: 8192,
            temperature: 0.2,
          },
        }),
      ),
    );
    if (!response.stream) {
      throw new Error('Empty chat response');
    }
    let produced = false;
    for await (const event of response.stream) {
      const delta = event.contentBlockDelta?.delta;
      if (delta && 'text' in delta && delta.text) {
        produced = true;
        yield delta.text;
      }
    }
    if (!produced) {
      throw new Error('Empty chat response');
    }
  }

  private async withThrottleRetry<T>(op: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await op();
      } catch (err) {
        if (attempt >= RETRY_DELAYS_MS.length || !isThrottling(err)) {
          throw err;
        }
        await delay(RETRY_DELAYS_MS[attempt]);
      }
    }
  }
}

export function isThrottling(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const name = 'name' in err ? String(err.name) : '';
  if (name === 'ThrottlingException' || name === 'TooManyRequestsException') {
    return true;
  }
  const meta =
    '$metadata' in err
      ? (err.$metadata as { httpStatusCode?: number } | undefined)
      : undefined;
  return meta?.httpStatusCode === 429;
}

function userMessage(request: ChatRequest): string {
  const context = request.chunks
    .map((chunk, index) => `[${index + 1}] ${chunk.filename}\n${chunk.content}`)
    .join('\n\n');
  return `Ngữ cảnh:\n${context}\n\nCâu hỏi: ${request.question}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
