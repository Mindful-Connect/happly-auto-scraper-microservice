import { Controller, Get, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { ExtractedOpportunity } from './schemas/extractedOpportunitySchema';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  async findAllOpportunities(): Promise<ExtractedOpportunity[]> {
    return await this.appService.getOpportunities();
  }

  @Post('/submit-url')
  async submitURL(@Query('url') url: string): Promise<any> {
    this.appService
      .submitURL(url)
      .then((result) => console.log(result))
      .catch((error) => console.log(error));
    return 'received url: ' + url;
  }
}
