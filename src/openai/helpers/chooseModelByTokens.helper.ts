import { GPTModel, TokenLimits } from '@/openai/openai.types';

export function chooseModelByTokens(tokens: number): [GPTModel, (typeof TokenLimits)[keyof typeof TokenLimits]] {
  if (tokens <= TokenLimits['gpt-3.5-turbo'] / 1.5) {
    return [GPTModel.GPT3_5_Turbo, TokenLimits['gpt-3.5-turbo']];
  }

  return [GPTModel.GPT4, TokenLimits['gpt-4']];
}
