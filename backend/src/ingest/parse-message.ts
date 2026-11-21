import { DocumentJob } from '../drivers/queue/queue.service';

export type ParsedMessage =
  | { kind: 'test-event' }
  | { kind: 'jobs'; jobs: DocumentJob[] }
  | { kind: 'invalid' };

export function parseMessage(body: string): ParsedMessage {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { kind: 'invalid' };
  }
  if (!json || typeof json !== 'object') {
    return { kind: 'invalid' };
  }

  const record = json as Record<string, unknown>;
  if (record.Event === 's3:TestEvent') {
    return { kind: 'test-event' };
  }

  if (Array.isArray(record.Records)) {
    const jobs: DocumentJob[] = [];
    for (const item of record.Records) {
      const job = jobFromS3Record(item);
      if (job) {
        jobs.push(job);
      }
    }
    return jobs.length > 0 ? { kind: 'jobs', jobs } : { kind: 'invalid' };
  }

  if (
    typeof record.documentId === 'string' &&
    typeof record.tenantId === 'string' &&
    typeof record.s3Key === 'string'
  ) {
    return {
      kind: 'jobs',
      jobs: [
        {
          documentId: record.documentId,
          tenantId: record.tenantId,
          s3Key: record.s3Key,
        },
      ],
    };
  }

  return { kind: 'invalid' };
}

function jobFromS3Record(item: unknown): DocumentJob | null {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const key = (item as { s3?: { object?: { key?: unknown } } }).s3?.object?.key;
  if (typeof key !== 'string' || !key) {
    return null;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(key.replace(/\+/g, ' '));
  } catch {
    return null;
  }
  const match = /^tenants\/([^/]+)\/([^/]+)\/(.+)$/.exec(decoded);
  if (!match) {
    return null;
  }
  return {
    tenantId: match[1],
    documentId: match[2],
    s3Key: decoded,
  };
}
