import { Body, Controller, Get, Post, Sse, MessageEvent, UseGuards } from '@nestjs/common';
import { AppService } from '../services/app.service';
import { ExtractedOpportunity } from '../schemas/extractedOpportunity.schema';
import { SubmitURLsRequestDto } from '../dtos/request/submitURLs.request.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { fromEvent, map, Observable } from 'rxjs';
import { OpportunityEventNamesEnum } from '../enums/opportunityEventNames.enum';
import { AuthTokenGuard } from '../guards/authToken.guard';

@Controller()
@UseGuards(AuthTokenGuard)
export class AppController {
  constructor(private readonly appService: AppService, private eventEmitter: EventEmitter2) {}

  @Get('/opportunities')
  async getOpportunities(): Promise<ExtractedOpportunity[]> {
    return await this.appService.getOpportunities();
  }

  // @Post('/opportunities')
  // async submitURL(@Query('url') url: string): Promise<string> {
  //   console.info('Submitting a new URL 🔗: ', url);
  //   this.appService
  //     .submitQueueItem({ url, name: '', queueId: '' })
  //     .then()
  //     .catch(error => {
  //       this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionRecurseNeeded);
  //       console.log(error);
  //     });
  //
  //   return url;
  // }

  @Post('/opportunities')
  async submitURLs(@Body() urlsRequestDto: SubmitURLsRequestDto): Promise<SubmitURLsRequestDto> {
    console.info('Submitting a list of URLs 🔗📃: ', urlsRequestDto);
    urlsRequestDto.queueItems.forEach(queueItem => {
      this.appService
        .submitQueueItem(queueItem)
        .then()
        .catch(error => {
          this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease);
          console.log(error);
        });
    });

    return urlsRequestDto;
  }

  @Sse('/opportunities/sse')
  async listenForUpdates(): Promise<Observable<MessageEvent>> {
    return fromEvent(this.eventEmitter, OpportunityEventNamesEnum.ExtractionProcessUpdate).pipe(
      map(payload => ({
        data: JSON.stringify(payload),
      })),
    );
  }
}
