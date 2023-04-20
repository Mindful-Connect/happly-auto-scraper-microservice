import { Module } from '@nestjs/common';
import { AppController } from './app/controllers/app.controller';
import { AppService } from './app/services/app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ExtractedOpportunity, ExtractedOpportunitySchema } from './app/schemas/extractedOpportunity.schema';
import { Field, FieldSchema } from './app/schemas/field.schema';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { OpenaiModule } from './openai/openai.module';
import { ProcessLogger } from './app/services/app.processLogger';
import { ScheduleModule } from '@nestjs/schedule';
import { HapplyModule } from './happly/happly.module';
import { ExtractedOpportunityRepository } from '@/app/repositories/extractedOpportunity.repository';

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
    MongooseModule.forFeature([
      { name: ExtractedOpportunity.name, schema: ExtractedOpportunitySchema },
      { name: Field.name, schema: FieldSchema },
    ]),
    ScheduleModule.forRoot(),
    OpenaiModule,
    HapplyModule,
  ],
  controllers: [AppController],
  providers: [AppService, ProcessLogger, ExtractedOpportunityRepository],
})
export class AppModule {}
