import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { OpportunityPortalService } from './services/opportunityPortal.service';
import { ExtractedOpportunityModule } from '@/extracted-opportunity/extractedOpportunity.module';
import { HapplyWebhooksController } from '@/happly/controllers/happlyWebhooks.controller';

@Module({
  imports: [HttpModule, ExtractedOpportunityModule],
  providers: [OpportunityPortalService],
  controllers: [HapplyWebhooksController],
  exports: [OpportunityPortalService],
})
export class HapplyModule {}
