export type ChatGPTAgent = 'user' | 'system' | 'assistant';

export type GPTFinishReason =
  | 'stop'
  | 'length'
  | 'content_filter'
  | 'null'
  | null; // not sure which null it is.. string or the actual null.

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
