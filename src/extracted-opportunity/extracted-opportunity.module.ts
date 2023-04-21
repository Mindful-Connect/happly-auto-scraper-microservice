import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExtractedOpportunity, ExtractedOpportunitySchema } from '@/extracted-opportunity/schemas/extractedOpportunity.schema';
import { Field, FieldSchema } from '@/extracted-opportunity/schemas/field.schema';
import { ExtractedOpportunityRepository } from '@/extracted-opportunity/repositories/extractedOpportunity.repository';
import { ExtractedOpportunityController } from '@/extracted-opportunity/controllers/extracted-opportunity.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExtractedOpportunity.name, schema: ExtractedOpportunitySchema },
      { name: Field.name, schema: FieldSchema },
    ]),
  ],
  providers: [ExtractedOpportunityRepository],
  controllers: [ExtractedOpportunityController],
  exports: [MongooseModule, ExtractedOpportunityRepository],
})
export class ExtractedOpportunityModule {}
