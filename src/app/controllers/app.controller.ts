import { Body, Controller, Get, Post, Sse, MessageEvent, UseGuards, Param, NotFoundException } from '@nestjs/common';
import { AppService } from '../services/app.service';
import { ExtractedOpportunity } from '../schemas/extractedOpportunity.schema';
import { SubmitURLsRequestDto } from '../dtos/request/submitURLs.request.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { fromEvent, map, Observable } from 'rxjs';
import { OpportunityEventNamesEnum } from '../enums/opportunityEventNames.enum';
import { AuthTokenGuard } from '../guards/authToken.guard';
import { OpportunityPortalService } from '@/happly/services/opportunityPortal.service';
import { ExtractedOpportunityRepository } from '@/app/repositories/extractedOpportunity.repository';

@Controller()
@UseGuards(AuthTokenGuard)
export class AppController {
  constructor(
    private readonly appService: AppService,
    private eventEmitter: EventEmitter2,
    private opportunityPortalService: OpportunityPortalService,
    private extractedOpportunityRepository: ExtractedOpportunityRepository,
  ) {}

  @Get('/opportunities')
  async getOpportunities(): Promise<ExtractedOpportunity[]> {
    return await this.extractedOpportunityRepository.getOpportunities();
  }

  @Get('/opportunities/:queueId')
  async getOpportunityByQueueId(@Param('queueId') queueId: string) {
    const doc = await this.extractedOpportunityRepository.findOpportunityByQueueId(queueId);
    if (!doc) throw new NotFoundException();
    return doc;
  }

  @Get('/opportunities/:queueId/scraped')
  async getScrapedOpportunityByQueueId(@Param('queueId') queueId: string) {
    const dto = await this.extractedOpportunityRepository.getScrapedOpportunityByQueueId(queueId);
    if (!dto) throw new NotFoundException();
    return dto;
  }

  @Get('/test')
  async test() {
    this.opportunityPortalService.test();
  }

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
