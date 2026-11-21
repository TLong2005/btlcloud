import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import {
  DocumentJob,
  QueueService,
  ReceivedMessage,
  serializeJob,
} from './queue.service';

export class SqsQueueService implements QueueService {
  private readonly client: SQSClient;

  constructor(
    region: string,
    private readonly queueUrl: string,
  ) {
    this.client = new SQSClient({ region });
  }

  async enqueue(job: DocumentJob): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: serializeJob(job),
      }),
    );
  }

  async receive(): Promise<ReceivedMessage | null> {
    const response = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
        MessageSystemAttributeNames: ['ApproximateReceiveCount'],
      }),
    );
    const message = response.Messages?.[0];
    if (!message?.Body || !message.ReceiptHandle) {
      return null;
    }
    const receiveCount = Number(message.Attributes?.ApproximateReceiveCount ?? '1');
    return {
      body: message.Body,
      receiptHandle: message.ReceiptHandle,
      receiveCount: Number.isInteger(receiveCount) && receiveCount > 0 ? receiveCount : 1,
    };
  }

  async delete(receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }

  stop(): void {
    this.client.destroy();
  }
}
