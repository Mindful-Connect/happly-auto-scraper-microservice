import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Field, FieldSchema } from './field.schema';
import { HydratedDocument, Schema as SchemaMongoose } from 'mongoose';
import { getMySQLDateFormatUTC, newUUID } from '../utils/helperFunctions';
import { OpportunityStatusEnum } from '../enums/opportunityStatus.enum';

export type ExtractedOpportunityDocument = HydratedDocument<ExtractedOpportunity>;

export const InterestingFields: string[] = [
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

  // 'opportunity_subcategories',
  // 'opportunity_insights',
  // 'opportunity_deadlines',
  // 'opportunity_open_date',
  // 'opportunity_process_time',
  // 'opportunity_comp_req',
];

@Schema()
export class ExtractedOpportunity {
  constructor(partial?: Partial<ExtractedOpportunity>) {
    Object.assign(this, partial);
  }

  // <editor-fold desc="Meta data of Opportunity">
  /**
   * Generated UUID by this microservice. Used to identify the opportunity
   * among the admin portal and the core API.
   */
  @Prop({ default: () => newUUID() })
  syncId: string; // UUID

  @Prop({ type: null })
  url: string;

  /**
   * Whether the opportunity is a client rendered page or not. If true, puppeteer will be used to
   * scrape the HTML body of the page. If not, cheerios will be used as if it is a static page.
   */
  @Prop({ type: SchemaMongoose.Types.Boolean })
  clientRenderedPage: boolean;

  @Prop({
    type: SchemaMongoose.Types.String,
    enum: OpportunityStatusEnum,
    default: OpportunityStatusEnum.PENDING,
  })
  status: OpportunityStatusEnum;

  @Prop({ default: getMySQLDateFormatUTC() })
  submittedAt: string;
  // </editor-fold>

  // <editor-fold desc="Fields">
  @Prop({ type: FieldSchema })
  opportunity_provider_name: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  opportunity_issuer_name: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  program_name: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  application_opening_date: Field<string> = new Field('date');

  @Prop({ type: FieldSchema })
  application_deadline: Field<string> = new Field('date');

  @Prop({ type: FieldSchema })
  opportunity_value_proposition: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  opportunitys_grant_types: Field<string[]> = new Field(
    'string[]',
    'where `opportunitys_grant_types` is an array of strings, phrasing what types of grants this opportunity gives the applicants.',
  );

  @Prop({ type: FieldSchema })
  eligibility_requirements: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  application_country: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  province: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  municipality: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  company_size_requirements: Field<number[]> = new Field('number[]');

  @Prop({ type: FieldSchema })
  company_revenue_requirements: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  company_reporting_requirements: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  industry: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  funding_amounts: Field<number[]> = new Field('number[]');

  @Prop({ type: FieldSchema })
  application_process_type: Field<string[]> = new Field(
    'string[]',
    'where `application_process_type` is an array of all the possible ways to apply for this program. Possible values are: "online form", "contacting representatives", or "email submission"',
  );
  // </editor-fold>

  @Prop({ default: getMySQLDateFormatUTC() })
  createdAt: string;

  @Prop({ default: getMySQLDateFormatUTC() })
  updatedAt: string;
}

export const ExtractedOpportunitySchema = SchemaFactory.createForClass(ExtractedOpportunity);

ExtractedOpportunitySchema.pre('save', function (next) {
  const extractedOpportunity = this as ExtractedOpportunityDocument;

  const now = getMySQLDateFormatUTC();
  if (!extractedOpportunity.syncId) {
    extractedOpportunity.createdAt = now;
  }
  extractedOpportunity.updatedAt = now;
  next();
});
