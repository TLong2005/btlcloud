export const QUEUE_SERVICE = 'QUEUE_SERVICE';

export interface DocumentJob {
  documentId: string;
  tenantId: string;
  s3Key: string;
}

export interface ReceivedMessage {
  body: string;
  receiptHandle: string;
  receiveCount: number;
}

export interface QueueService {
  enqueue(job: DocumentJob): Promise<void>;
  receive(): Promise<ReceivedMessage | null>;
  delete(receiptHandle: string): Promise<void>;
  stop(): void;
}

export function serializeJob(job: DocumentJob): string {
  return JSON.stringify({
    documentId: job.documentId,
    tenantId: job.tenantId,
    s3Key: job.s3Key,
  });
}
