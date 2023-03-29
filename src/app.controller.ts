import { Controller, Get, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { ExtractedOpportunity } from './schemas/extractedOpportunity.schema';
import { Opportunity } from './schemas/opportunity.schema';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  async findAllOpportunities(): Promise<ExtractedOpportunity[]> {
    return await this.appService.getOpportunities();
  }

  @Get('/submitted')
  async findAllSubmittedOpportunities(): Promise<Opportunity[]> {
    return await this.appService.getSubmittedOpportunities();
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
