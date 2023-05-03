import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExpiredOpportunity, ExpiredOpportunitySchema } from '@/expired-opportunity/expiredOpportunity.schema';
import { ExpiredOpportunityController } from '@/expired-opportunity/expiredOpportunity.controller';
import { ExpiredOpportunityService } from '@/expired-opportunity/services/expiredOpportunity.service';
import { ExtractorForExpiredOpportunityService } from '@/expired-opportunity/services/extractorForExpiredOpportunity.service';
import { ExpiredOpportunityRepository } from '@/expired-opportunity/expiredOpportunity.repository';
import { HapplyModule } from '@/happly/happly.module';
import { OpenaiModule } from '@/openai/openai.module';
import { AutoScraperModule } from '@/auto-scraper/auto-scraper.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ExpiredOpportunity.name, schema: ExpiredOpportunitySchema }]),
    HapplyModule,
    OpenaiModule,
    AutoScraperModule,
  ],
  controllers: [ExpiredOpportunityController],
  providers: [ExpiredOpportunityService, ExtractorForExpiredOpportunityService, ExpiredOpportunityRepository],
  exports: [MongooseModule],
})
export class ExpiredOpportunityModule {}
