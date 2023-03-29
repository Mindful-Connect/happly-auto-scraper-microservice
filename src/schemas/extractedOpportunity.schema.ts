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

  public interestingFields: string[] = [
    'opportunity_provider_name',
    'opportunity_issuer_name',
    'program_name',
    'application_opening_date',
    'application_deadline',
    'opportunity_value_proposition',
    'opportunitys_grant_types',
    'eligibility_requirements',
    'application_country',
    'province',
    'municipality',
    'company_size_requirements',
    'company_revenue_requirements',
    'company_reporting_requirements',
    'industry',
    'funding_amounts',
    'application_process_type',

    // TODO add these fields and decide if they are required or not whatever idk. some possible fields to add ???:

    'opportunity_subcategories',
    'opportunity_insights',
    'opportunity_deadlines',
    'opportunity_open_date',
    'opportunity_process_time',
    'opportunity_comp_req',
  ];

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

  @Prop({ type: FieldSchema })
  opportunitys_grant_types: Field<string[]>;

  @Prop({ type: FieldSchema })
  eligibility_requirements: Field<string[]>;

  @Prop({ type: FieldSchema })
  application_country: Field<string>;

  @Prop({ type: FieldSchema })
  province: Field<string>;

  @Prop({ type: FieldSchema })
  municipality: Field<string>;

  @Prop({ type: FieldSchema })
  company_size_requirements: Field<number[]>;

  @Prop({ type: FieldSchema })
  company_revenue_requirements: Field<string>;

  @Prop({ type: FieldSchema })
  company_reporting_requirements: Field<string[]>;

  @Prop({ type: FieldSchema })
  industry: Field<string>;

  @Prop({ type: FieldSchema })
  funding_amounts: Field<number[]>;

  @Prop({ type: FieldSchema })
  application_process_type: Field<string[]>;

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
