import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AutoScraperModule } from '@/auto-scraper/auto-scraper.module';
import { ExtractedOpportunityModule } from '@/extracted-opportunity/extractedOpportunity.module';
import { ExpiredOpportunityModule } from '@/expired-opportunity/expiredOpportunity.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
    }),
    ScheduleModule.forRoot(),
    AutoScraperModule,
    ExtractedOpportunityModule,
    ExpiredOpportunityModule,
  ],
})
export class AppModule {}
