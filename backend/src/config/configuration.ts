export type StorageDriver = 's3' | 'local';
export type QueueDriver = 'sqs' | 'inmemory';
export type AiDriver = 'bedrock' | 'mock' | 'openai';

export interface AppConfig {
  port: number;
  databaseUrl: string | null;
  dbSecretArn: string | null;
  awsRegion: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  storageDriver: StorageDriver;
  s3Bucket: string | null;
  queueDriver: QueueDriver;
  sqsQueueUrl: string | null;
  aiDriver: AiDriver;
  bedrockChatModelId: string | null;
  bedrockEmbeddingModelId: string;
  openaiApiKey: string | null;
  openaiBaseUrl: string;
  openaiChatModel: string;
  openaiEmbeddingModel: string;
  similarityThreshold: number;
  demoMode: boolean;
  workDir: string;
  maxUploadMb: number;
  maxReceiveCount: number;
  workerArtificialDelayMs: number;
}

function oneOf<T extends string>(
  name: string,
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = (value ?? '').trim();
  const selected = (raw === '' ? fallback : raw) as T;
  if (!allowed.includes(selected)) {
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return selected;
}

function required(name: string, value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    throw new Error(`Missing required env var ${name}`);
  }
  return trimmed;
}

export function loadConfig(): AppConfig {
  const storageDriver = oneOf(
    'STORAGE_DRIVER',
    process.env.STORAGE_DRIVER,
    ['s3', 'local'] as const,
    'local',
  );
  const queueDriver = oneOf(
    'QUEUE_DRIVER',
    process.env.QUEUE_DRIVER,
    ['sqs', 'inmemory'] as const,
    'inmemory',
  );
  const aiDriver = oneOf(
    'AI_DRIVER',
    process.env.AI_DRIVER,
    ['bedrock', 'mock', 'openai'] as const,
    'mock',
  );

  const databaseUrl = (process.env.DATABASE_URL ?? '').trim() || null;
  const dbSecretArn = (process.env.DB_SECRET_ARN ?? '').trim() || null;
  if (!databaseUrl && !dbSecretArn) {
    throw new Error('Set DATABASE_URL or DB_SECRET_ARN');
  }

  const thresholdRaw = (process.env.SIMILARITY_THRESHOLD ?? '').trim();
  const similarityThreshold = thresholdRaw === '' ? 0.3 : Number(thresholdRaw);
  if (
    Number.isNaN(similarityThreshold) ||
    similarityThreshold < 0 ||
    similarityThreshold > 1
  ) {
    throw new Error('SIMILARITY_THRESHOLD must be a number between 0 and 1');
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('PORT must be a positive integer');
  }

  const maxUploadMb = integerFromEnv('MAX_UPLOAD_MB', 10, 1);
  const maxReceiveCount = integerFromEnv('MAX_RECEIVE_COUNT', 3, 1);
  const workerArtificialDelayMs = numberFromEnv('WORKER_ARTIFICIAL_DELAY_MS', 0, 0);

  return {
    port,
    databaseUrl,
    dbSecretArn,
    awsRegion: (process.env.AWS_REGION ?? '').trim() || 'ap-southeast-1',
    jwtSecret: required('JWT_SECRET', process.env.JWT_SECRET),
    jwtExpiresIn: (process.env.JWT_EXPIRES_IN ?? '').trim() || '8h',
    storageDriver,
    s3Bucket:
      storageDriver === 's3'
        ? required('S3_BUCKET', process.env.S3_BUCKET)
        : (process.env.S3_BUCKET ?? '').trim() || null,
    queueDriver,
    sqsQueueUrl:
      queueDriver === 'sqs'
        ? required('SQS_QUEUE_URL', process.env.SQS_QUEUE_URL)
        : (process.env.SQS_QUEUE_URL ?? '').trim() || null,
    aiDriver,
    bedrockChatModelId:
      aiDriver === 'bedrock'
        ? required('BEDROCK_CHAT_MODEL_ID', process.env.BEDROCK_CHAT_MODEL_ID)
        : (process.env.BEDROCK_CHAT_MODEL_ID ?? '').trim() || null,
    bedrockEmbeddingModelId:
      (process.env.BEDROCK_EMBEDDING_MODEL_ID ?? '').trim() ||
      'amazon.titan-embed-text-v2:0',
    openaiApiKey:
      aiDriver === 'openai'
        ? required('OPENAI_API_KEY', process.env.OPENAI_API_KEY)
        : (process.env.OPENAI_API_KEY ?? '').trim() || null,
    openaiBaseUrl:
      (process.env.OPENAI_BASE_URL ?? '').trim() || 'https://api.openai.com/v1',
    openaiChatModel:
      (process.env.OPENAI_CHAT_MODEL ?? '').trim() || 'gpt-4o-mini',
    openaiEmbeddingModel:
      (process.env.OPENAI_EMBEDDING_MODEL ?? '').trim() ||
      'text-embedding-3-small',
    similarityThreshold,
    demoMode: (process.env.DEMO_MODE ?? '').trim() === 'true',
    workDir: (process.env.WORK_DIR ?? '').trim() || '/tmp/docmind',
    maxUploadMb,
    maxReceiveCount,
    workerArtificialDelayMs,
  };
}

function numberFromEnv(name: string, fallback: number, min: number): number {
  const raw = (process.env[name] ?? '').trim();
  const value = raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min) {
    throw new Error(`${name} must be a number >= ${min}`);
  }
  return value;
}

function integerFromEnv(name: string, fallback: number, min: number): number {
  const value = numberFromEnv(name, fallback, min);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}
