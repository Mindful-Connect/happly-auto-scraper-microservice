import { Module } from '@nestjs/common';
import { ChatGPTService } from './services/chatgpt.service';

@Module({
  exports: [ChatGPTService],
  providers: [ChatGPTService],
})
export class OpenaiModule {}
