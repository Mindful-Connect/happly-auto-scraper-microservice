import { Module } from '@nestjs/common';
import { AutoScraperController } from '@/auto-scraper/controllers/auto-scraper.controller';
import { AutoScraperService } from '@/auto-scraper/services/auto-scraper.service';
import { ProcessLogger } from '@/auto-scraper/libraries/processLogger.lib';
import { OpenaiModule } from '@/openai/openai.module';
import { HapplyModule } from '@/happly/happly.module';
import { ExtractedOpportunityModule } from '@/extracted-opportunity/extracted-opportunity.module';

@Module({
  imports: [ExtractedOpportunityModule, OpenaiModule, HapplyModule],
  providers: [ProcessLogger, AutoScraperService],
  controllers: [AutoScraperController],
  exports: [],
})
export class AutoScraperModule {}
