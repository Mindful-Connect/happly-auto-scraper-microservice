export type ChatGPTAgent = 'user' | 'system' | 'assistant';

export enum GPTModel {
  Text_Davinci_003 = 'text-davinci-003',
  GPT3_5_Turbo_0301 = 'gpt-3.5-turbo-0301',
  GPT3_5_Turbo = 'gpt-3.5-turbo',
  GPT4_0314 = 'gpt-4-0314',
  GPT4 = 'gpt-4',
}

export const TokenLimits: Record<GPTModel, number> = {
  [GPTModel.Text_Davinci_003]: 4097,
  [GPTModel.GPT3_5_Turbo_0301]: 4096,
  [GPTModel.GPT3_5_Turbo]: 4096,
  [GPTModel.GPT4_0314]: 8192,
  [GPTModel.GPT4]: 8192,
};

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
