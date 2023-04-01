import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ExtractedOpportunity,
  ExtractedOpportunitySchema,
} from './schemas/extractedOpportunity.schema';
import { Field, FieldSchema } from './schemas/field.schema';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { OpenaiModule } from './openai/openai.module';
import { ExtractorService } from './extractor.service';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot('mongodb://localhost/nest'),
    MongooseModule.forFeature([
      { name: ExtractedOpportunity.name, schema: ExtractedOpportunitySchema },
      { name: Field.name, schema: FieldSchema },
    ]),
    OpenaiModule,
  ],
  controllers: [AppController],
  providers: [AppService, ExtractorService],
})
export class AppModule {}
