export const CHAT_MODELS = [
  'gpt-6.1-terra',
  'gpt-6.1-sol',
  'gpt-6-astra',
  'gpt-6-sol',
  'gpt-6-luna',
  'gpt-5.6-sol',
  'gpt-4o-mini',
] as const;

export type ChatModel = (typeof CHAT_MODELS)[number];
