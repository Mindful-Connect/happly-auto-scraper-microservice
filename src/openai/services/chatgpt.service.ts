import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { OpenAIRequest } from '../openai.types';

@Injectable()
export class ChatGPTService {
  constructor(private configService: ConfigService) {}

  async getResponse(payload: OpenAIRequest) {
    const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      payload,
      {
        headers: {
          Authorization: `Bearer ${this.configService.get<string>(
            'OPENAI_API_KEY',
          )}`,
        },
      },
    );

    return res.data;
  }
}