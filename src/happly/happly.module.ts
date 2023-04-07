import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { OpportunityPortalService } from './services/opportunityPortal.service';

@Module({
  imports: [HttpModule],
  providers: [OpportunityPortalService],
  exports: [OpportunityPortalService],
})
export class HapplyModule {}
