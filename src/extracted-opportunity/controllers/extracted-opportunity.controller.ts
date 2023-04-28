import { Controller, Delete, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { AuthTokenGuard } from '@/_domain/guards/authToken.guard';
import { ExtractedOpportunityRepository } from '@/extracted-opportunity/repositories/extractedOpportunity.repository';
import { ExtractedOpportunity } from '@/extracted-opportunity/schemas/extractedOpportunity.schema';
import { OpportunityStatusDto } from '@/extracted-opportunity/dtos/opportunityStatus.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OpportunityEventNamesEnum } from '@/auto-scraper/enums/opportunityEventNames.enum';

@Controller('opportunities')
@UseGuards(AuthTokenGuard)
export class ExtractedOpportunityController {
  constructor(private readonly extractedOpportunityRepository: ExtractedOpportunityRepository, private readonly eventEmitter: EventEmitter2) {}

  @Get('/')
  async getOpportunities(): Promise<ExtractedOpportunity[]> {
    return await this.extractedOpportunityRepository.getOpportunities();
  }

  @Get('/:queueId')
  async getOpportunityByQueueId(@Param('queueId') queueId: string) {
    const doc = await this.extractedOpportunityRepository.findOpportunityByQueueId(queueId);
    if (!doc) throw new NotFoundException();
    return doc;
  }

  @Delete('/:queueId')
  async deleteOpportunityByQueueId(@Param('queueId') queueId: string) {
    this.eventEmitter.emitAsync(OpportunityEventNamesEnum.OpportunityDeleted, queueId).catch(error => console.error(error));
  }

  @Get('/:queueId/status')
  async getOpportunityStatusByQueueId(@Param('queueId') queueId: string): Promise<OpportunityStatusDto> {
    const doc = await this.extractedOpportunityRepository.findOpportunityByQueueId(queueId);
    if (!doc) throw new NotFoundException();
    return new OpportunityStatusDto({
      queueId: doc.queueId,
      status: doc.status,
      errorDetails: doc.errorDetails ?? null,
      source: doc.source,
    });
  }

  @Get('/:queueId/scraped')
  async getScrapedOpportunityByQueueId(@Param('queueId') queueId: string) {
    const dto = await this.extractedOpportunityRepository.getScrapedOpportunityByQueueId(queueId);
    if (!dto) throw new NotFoundException();
    return dto;
  }
}
