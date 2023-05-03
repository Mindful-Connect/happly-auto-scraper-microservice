import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExtractedOpportunity, ExtractedOpportunitySchema } from '@/extracted-opportunity/schemas/extractedOpportunity.schema';
import { Field, FieldSchema } from '@/extracted-opportunity/schemas/field.schema';
import { ExtractedOpportunityRepository } from '@/extracted-opportunity/repositories/extractedOpportunity.repository';
import { ExtractedOpportunityController } from '@/extracted-opportunity/controllers/extractedOpportunity.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Field.name, schema: FieldSchema },
      { name: ExtractedOpportunity.name, schema: ExtractedOpportunitySchema },
    ]),
  ],
  providers: [ExtractedOpportunityRepository],
  controllers: [ExtractedOpportunityController],
  exports: [MongooseModule, ExtractedOpportunityRepository],
})
export class ExtractedOpportunityModule {}
