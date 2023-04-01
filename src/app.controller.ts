import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { ExtractedOpportunity } from './schemas/extractedOpportunity.schema';
import { SubmitURLsRequestDto } from './dtos/request/submitURLs.request.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService, private eventEmitter: EventEmitter2) {}

  @Get('/opportunities')
  async getOpportunities(): Promise<ExtractedOpportunity[]> {
    return await this.appService.getOpportunities();
  }

  @Post('/opportunities')
  async submitURL(@Query('url') url: string): Promise<string> {
    console.info('Submitting a new URL 🔗: ', url);
    this.appService
      .submitURL(url)
      .then()
      .catch(error => {
        this.eventEmitter.emit('opportunity.extraction.pool.release');
        console.log(error);
      });

    return url;
  }

  @Post('/opportunities/multiple')
  async submitURLs(@Body() urlsRequestDto: SubmitURLsRequestDto): Promise<string[]> {
    console.info('Submitting a list of URLs 🔗📃: ', urlsRequestDto);
    urlsRequestDto.urls.forEach(url => {
      this.appService
        .submitURL(url)
        .then()
        .catch(error => {
          this.eventEmitter.emit('opportunity.extraction.pool.release');
          console.log(error);
        });
    });

    return urlsRequestDto.urls;
  }
}
