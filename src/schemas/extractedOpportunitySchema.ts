import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Field, FieldSchema } from './field.schema';
import { HydratedDocument } from 'mongoose';
import { getMySQLDateFormatUTC, newUUID } from '../utils/helperFunctions';

export type ExtractedOpportunityDocument =
  HydratedDocument<ExtractedOpportunity>;

@Schema()
export class ExtractedOpportunity {
  constructor(partial?: Partial<ExtractedOpportunity>) {
    Object.assign(this, partial);
  }
  /**
   * Generated UUID by this microservice. Used to identify the opportunity
   * among the admin portal and the core API.
   */
  @Prop({ default: () => newUUID() })
  syncId: string; // UUID

  @Prop({ type: FieldSchema })
  opportunity_provider_name: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  opportunity_issuer_name: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  program_name: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  application_opening_date: Field<Date | null, 'date'> = new Field<
    null,
    'date'
  >();

  @Prop({ type: FieldSchema })
  application_deadline: Field<Date | null, 'date'> = new Field<null, 'date'>();

  @Prop({ type: FieldSchema })
  opportunity_value_proposition: Field<string> = new Field();

  // TODO: Add more fields

  @Prop({ default: getMySQLDateFormatUTC() })
  createdAt: string;

  @Prop({ default: getMySQLDateFormatUTC() })
  updatedAt: string;
}

export const ExtractedOpportunitySchema =
  SchemaFactory.createForClass(ExtractedOpportunity);

ExtractedOpportunitySchema.pre('save', function (next) {
  const extractedOpportunity = this as ExtractedOpportunityDocument;

  const now = getMySQLDateFormatUTC();
  if (!extractedOpportunity.syncId) {
    extractedOpportunity.createdAt = now;
  }
  extractedOpportunity.updatedAt = now;
  next();
});
