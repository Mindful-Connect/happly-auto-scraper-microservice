import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { OpportunityPortalService } from './services/opportunityPortal.service';
import { ExtractedOpportunityRepository } from '@/extracted-opportunity/repositories/extractedOpportunity.repository';
import { ExtractedOpportunityModule } from '@/extracted-opportunity/extracted-opportunity.module';
import { HapplyWebhooksController } from '@/happly/controllers/happly-webhooks.controller';

@Module({
  imports: [HttpModule, ExtractedOpportunityModule],
  providers: [OpportunityPortalService, ExtractedOpportunityRepository],
  controllers: [HapplyWebhooksController],
  exports: [OpportunityPortalService],
})
export class HapplyModule {}
