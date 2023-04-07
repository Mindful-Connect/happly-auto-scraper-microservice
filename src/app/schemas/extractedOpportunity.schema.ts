import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Field, FieldSchema } from './field.schema';
import { HydratedDocument, Schema as SchemaMongoose } from 'mongoose';
import { getMySQLDateFormatUTC, newUUID } from '../utils/helperFunctions';
import { OpportunityStatusEnum } from '../enums/opportunityStatus.enum';

export type ExtractedOpportunityDocument = HydratedDocument<ExtractedOpportunity>;

export class InterestingField {
  shouldOverwrite = false;

  constructor(shouldOverwrite?: boolean) {
    this.shouldOverwrite = !!shouldOverwrite;
  }
}

export const InterestingFields: { [fieldName in string]: InterestingField } = {
  opportunity_provider_name: new InterestingField(),
  opportunity_issuer_name: new InterestingField(),

  program_name: new InterestingField(),
  program_description: new InterestingField(),

  link_to_application: new InterestingField(),

  application_opening_date: new InterestingField(true),
  application_deadline: new InterestingField(true),

  opportunity_value_proposition: new InterestingField(),
  opportunitys_grant_types: new InterestingField(),
  eligibility_requirements: new InterestingField(),

  application_country: new InterestingField(),
  province: new InterestingField(),
  municipality: new InterestingField(),

  company_size_requirements: new InterestingField(),
  company_revenue_requirements: new InterestingField(),
  company_reporting_requirements: new InterestingField(),

  industries: new InterestingField(),
  opportunity_subcategories: new InterestingField(),
  keywords: new InterestingField(),

  funding_amounts: new InterestingField(),

  application_process_type: new InterestingField(),
  application_process_time: new InterestingField(true),

  opportunity_insights: new InterestingField(),
};

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

  @Prop({ type: SchemaMongoose.Types.String, required: true })
  queueId: string; // UUID

  @Prop({ type: null })
  url: string;

  @Prop({ type: SchemaMongoose.Types.String })
  name: string;

  @Prop({ type: SchemaMongoose.Types.String })
  errorDetails?: string;

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
  program_description: Field<string> = new Field(
    'string',
    'where `program_description` is a description of the program described in 1000 characters (max) or less.',
  );

  @Prop({ type: FieldSchema })
  link_to_application: Field<string> = new Field(
    'string',
    'where `link_to_application` is a link to the application page where applicants can start applying on.',
  );

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
  industries: Field<string[]> = new Field(
    'string[]',
    'where `industries` is an array of strings, phrasing what industries this opportunity falls under.' +
      ' Examples are: "Agriculture", "Biotechnology", "Film/Music/Entertainment", Manufacturing", "Technology", "Educational Services", "Mining",' +
      ' "Artificial Intelligence", "Food Processing", "Healthcare", "Information/Communications Technology", "Environmental Sustainability"',
  );

  @Prop({ type: FieldSchema })
  opportunity_subcategories: Field<string[]> = new Field(
    'string[]',
    'where `opportunity_subcategories` is an array of strings, phrasing what subcategories this opportunity falls under.',
  );

  @Prop({ type: FieldSchema })
  keywords: Field<string[]> = new Field('string[]', 'where `keywords` is an array of strings, phrasing what keywords this opportunity falls under.');

  @Prop({ type: FieldSchema })
  funding_amounts: Field<number[]> = new Field('number[]');

  @Prop({ type: FieldSchema })
  application_process_type: Field<string[]> = new Field(
    'string[]',
    'where `application_process_type` is an array of all the possible ways to apply for this program. Possible values are: "online form", "contacting representatives", or "email submission"',
  );

  @Prop({ type: FieldSchema })
  application_process_time: Field<string> = new Field(
    'string',
    'where `application_process_time` is the time it takes to process an application. Possible values are: ' + '"Long", "Moderate", "Quick"',
  );

  @Prop({ type: FieldSchema })
  opportunity_insights: Field<string[]> = new Field(
    'string[]',
    'where `opportunity_insights` is an array of strings, stating brief facts to consider about the opportunities that an applicant could have in mind just from reading those bullet points. ' +
      'Example: `["The following companies are eligible:", "Companies with less than 10 employees", "Companies with less than 1 million in revenue"]`',
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
