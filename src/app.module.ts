import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ExtractedOpportunity, ExtractedOpportunitySchema } from './schemas/extractedOpportunity.schema';
import { Field, FieldSchema } from './schemas/field.schema';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { OpenaiModule } from './openai/openai.module';
import { ExtractorService } from './extractor.service';
import { ProcessLogger } from '../app.processLogger';

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
    OpenaiModule,
  ],
  controllers: [AppController],
  providers: [AppService, ExtractorService, ProcessLogger],
})
export class AppModule {}
