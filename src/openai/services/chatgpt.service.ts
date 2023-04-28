import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { OpenAIRequest } from '../openai.types';

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
}
