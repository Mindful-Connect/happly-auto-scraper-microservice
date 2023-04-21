import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { AuthTokenGuard } from '@/_domain/guards/authToken.guard';
import { ExtractedOpportunityRepository } from '@/extracted-opportunity/repositories/extractedOpportunity.repository';
import { OpportunityPortalService } from '@/happly/services/opportunityPortal.service';

@Controller('happly/webhooks')
@UseGuards(AuthTokenGuard)
export class HapplyWebhooksController {
  constructor(
    private readonly extractedOpportunityRepository: ExtractedOpportunityRepository,
    private readonly opportunityPortalService: OpportunityPortalService,
  ) {}

  @Get('/extracted-opportunity/submit/:queueId')
  async submitExtractedOpportunity(@Param('queueId') queueId: string) {
    const doc = await this.extractedOpportunityRepository.findOpportunityByQueueId(queueId);
    if (!doc) throw new NotFoundException();
    await this.opportunityPortalService.submitNewScrapedOpportunity(doc);
  }
}
