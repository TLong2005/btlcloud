import {
  AiService,
  assertEmbeddingModel,
  ChatRequest,
  EMBEDDING_DIMENSIONS,
  EmbedPurpose,
  Embedding,
} from './ai.service';

const UNIQUE_TOKEN_CAP = 40;

const STOP_WORDS = new Set([
  'và',
  'của',
  'là',
  'được',
  'cho',
  'trong',
  'các',
  'một',
  'khi',
  'với',
  'có',
  'để',
  'theo',
  'này',
  'đó',
  'những',
  'phải',
  'sau',
  'trước',
  'trên',
  'từ',
  'đến',
  'hoặc',
  'nếu',
  'thì',
  'về',
  'tại',
  'đã',
  'sẽ',
  'đang',
]);

export class MockAiService implements AiService {
  readonly embeddingModel = 'mock';

  async embed(text: string, _purpose?: EmbedPurpose, model?: string): Promise<Embedding> {
    assertEmbeddingModel(this, model);
    return { model: this.embeddingModel, vector: fakeEmbedding(text) };
  }

  async chat(request: ChatRequest): Promise<string> {
    const top = request.chunks[0];
    const quote = (top?.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    const filename = top?.filename ?? 'tài liệu';
    return `Theo tài liệu ${filename}: "${quote}"`;
  }
}

function fakeEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (STOP_WORDS.has(token) || seen.has(token)) {
      continue;
    }
    if (seen.size >= UNIQUE_TOKEN_CAP) {
      break;
    }
    seen.add(token);
    const hash = fnv1a(token);
    const index = hash % EMBEDDING_DIMENSIONS;
    vector[index] += (hash & 0x80000000) === 0 ? 1 : -1;
  }
  let sumSquares = 0;
  for (const value of vector) {
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) {
    vector[0] = 1;
    return vector;
  }
  return vector.map((value) => value / norm);
}

function fnv1a(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
