export type DocumentStatus = "UPLOADED" | "PROCESSING" | "READY" | "FAILED";

export type DocumentRecord = {
  id: string;
  filename: string;
  sizeBytes: number;
  status: DocumentStatus;
  errorMessage: string | null;
  chunkCount: number;
  createdAt: string;
};

export type AskSource = {
  documentId: string;
  filename: string;
  snippet: string;
  score: number;
};

export type AskResponse = {
  answer: string;
  insufficientData: boolean;
  sources: AskSource[];
};

export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationTurn = {
  id: string;
  question: string;
  answer: string;
  model: string | null;
  insufficientData: boolean;
  sources: AskSource[];
  createdAt: string;
};

export type ConversationDetail = ConversationSummary & {
  turns: ConversationTurn[];
};

export type HealthSnapshot = {
  status: string;
  instanceId: string;
  availabilityZone: string;
  time: string;
};
