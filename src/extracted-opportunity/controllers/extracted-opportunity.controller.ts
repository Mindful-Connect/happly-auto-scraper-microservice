import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { AuthTokenGuard } from '@/_domain/guards/authToken.guard';
import { ExtractedOpportunityRepository } from '@/extracted-opportunity/repositories/extractedOpportunity.repository';
import { ExtractedOpportunity } from '@/extracted-opportunity/schemas/extractedOpportunity.schema';
import { OpportunityStatusDto } from '@/extracted-opportunity/dtos/opportunityStatus.dto';

@Controller('opportunities')
@UseGuards(AuthTokenGuard)
export class ExtractedOpportunityController {
  constructor(private readonly extractedOpportunityRepository: ExtractedOpportunityRepository) {}

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
