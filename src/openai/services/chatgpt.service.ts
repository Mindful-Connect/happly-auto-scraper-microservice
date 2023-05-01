import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { OpenAIRequest } from '../openai.types';

type BackoffExponentiallyOptions = {
  maxRetries: number;
  retryDelay: number;
};

@Injectable()
export class ChatGPTService {
  constructor(private configService: ConfigService) {}

  async getResponse(abortController: AbortController, payload: OpenAIRequest) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const res = await axios.post('https://api.openai.com/v1/chat/completions', payload, {
      signal: abortController.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    return res.data;
  }

  async getResponseWithBackoffForRateLimit(
    abortController: AbortController,
    payload: OpenAIRequest,
    backoffExponentiallyOptions: BackoffExponentiallyOptions = { maxRetries: 10, retryDelay: 10000 },
    currentRetry = 0,
  ) {
    try {
      return await this.getResponse(abortController, payload);
    } catch (e) {
      if (e.response && e.response.status === 429 && currentRetry < backoffExponentiallyOptions.maxRetries) {
        const delay = (1 << currentRetry) * backoffExponentiallyOptions.retryDelay;
        await new Promise(resolve => setTimeout(resolve, delay));

        return this.getResponseWithBackoffForRateLimit(abortController, payload, backoffExponentiallyOptions, currentRetry + 1);
      }

      throw e;
    }
  }
}
