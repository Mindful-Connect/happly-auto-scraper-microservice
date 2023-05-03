import { GPTModel, TokenLimits } from '@/openai/openai.types';
import { encode } from 'gpt-3-encoder';

export function chooseModelByTokens(tokens: number, numOfRequestingFields: number): [GPTModel, (typeof TokenLimits)[keyof typeof TokenLimits]] {
  return [GPTModel.GPT3_5_Turbo, TokenLimits['gpt-3.5-turbo']];

  // TODO: Right now, we only use GPT3.5 Turbo. Though, we could use GPT4 (sometimes) if we wanted to.
  // GPT4 is more expensive, but it's also more accurate.
  // if (tokens <= TokenLimits['gpt-3.5-turbo'] / 1.5 && numOfRequestingFields < 16) {
  //   return [GPTModel.GPT3_5_Turbo, TokenLimits['gpt-3.5-turbo']];
  // }
  //
  // return [GPTModel.GPT4, TokenLimits['gpt-4']];
}

export function countTokens(messages: string[]) {
  let totalTokens = 0;

  for (const message of messages) {
    totalTokens += 4; // every message follows <im_start>{role/name}\n{content}<im_end>\n
    totalTokens += encode(message).length;
  }
  totalTokens += 2; // every reply is primed with <im_start>assistant

  return totalTokens;
}
