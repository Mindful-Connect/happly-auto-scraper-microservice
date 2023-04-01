export type ChatGPTAgent = 'user' | 'system' | 'assistant';

export enum GPTFinishReason {
  STOP = 'stop',
  LENGTH = 'length',
  CONTENT_FILTER = 'content_filter',
  NULL = 'null',
}

export interface ChatGPTMessage {
  role: ChatGPTAgent;
  content: string;
}

export interface OpenAIRequest {
  model: string;
  messages: ChatGPTMessage[];
  temperature: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
  max_tokens: number;
  stream: boolean;
  n: number;
}
