import { Module } from '@nestjs/common';
import { AutoScraperController } from '@/auto-scraper/controllers/autoScraper.controller';
import { AutoScraperService } from '@/auto-scraper/services/autoScraper.service';
import { ProcessLogger } from '@/auto-scraper/libraries/processLogger.lib';
import { OpenaiModule } from '@/openai/openai.module';
import { HapplyModule } from '@/happly/happly.module';
import { ExtractedOpportunityModule } from '@/extracted-opportunity/extractedOpportunity.module';
import { ExtractorService } from '@/auto-scraper/services/extractor.service';
import { ExtractionProcessManager } from '@/auto-scraper/libraries/extractionProcessManager.lib';

@Module({
  imports: [ExtractedOpportunityModule, OpenaiModule, HapplyModule],
  providers: [ExtractionProcessManager, ProcessLogger, AutoScraperService, ExtractorService],
  controllers: [AutoScraperController],
  exports: [ProcessLogger, AutoScraperService],
})
export class AutoScraperModule {}
