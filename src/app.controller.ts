import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ExtractedOpportunity } from './schemas/extractedOpportunitySchema';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  async findAllOpportunities(): Promise<ExtractedOpportunity[]> {
    return await this.appService.getOpportunities();
  }
}
