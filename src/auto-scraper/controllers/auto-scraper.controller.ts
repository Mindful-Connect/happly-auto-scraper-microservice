import { Body, Controller, Get, Post, Sse, MessageEvent, UseGuards } from '@nestjs/common';
import { AutoScraperService } from '@/auto-scraper/services/auto-scraper.service';
import { SubmitURLsRequestDto } from '@/auto-scraper/dtos/request/submitURLs.request.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { fromEvent, map, Observable } from 'rxjs';
import { OpportunityEventNamesEnum } from '@/auto-scraper/enums/opportunityEventNames.enum';
import { AuthTokenGuard } from '@/_domain/guards/authToken.guard';

@Controller()
@UseGuards(AuthTokenGuard)
export class AutoScraperController {
  constructor(private readonly autoScraperService: AutoScraperService, private eventEmitter: EventEmitter2) {}

  @Post('/scrape')
  async submitURLs(@Body() urlsRequestDto: SubmitURLsRequestDto): Promise<SubmitURLsRequestDto> {
    console.info('Submitting a list of URLs 🔗📃: ', urlsRequestDto);
    urlsRequestDto.queueItems.forEach(queueItem => {
      this.autoScraperService
        .submitQueueItem(queueItem)
        .then()
        .catch(error => {
          this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease);
          console.log(error);
        });
    });

    return urlsRequestDto;
  }

  @Sse('/scrape/sse')
  async listenForUpdates(): Promise<Observable<MessageEvent>> {
    return fromEvent(this.eventEmitter, OpportunityEventNamesEnum.ExtractionProcessUpdate).pipe(
      map(payload => ({
        data: JSON.stringify(payload),
      })),
    );
  }
}
