import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Field, FieldSchema } from './field.schema';
import { HydratedDocument, Schema as SchemaMongoose } from 'mongoose';
import { getMySQLDateFormatUTC, newUUID } from '@/app/helpers/helperFunctions';
import { AutoScraperQueueStatusEnum } from '../enums/autoScraperQueueStatus.enum';

export type ExtractedOpportunityDocument = HydratedDocument<ExtractedOpportunity>;

export class InterestingField {
  shouldOverwrite = false;

  stringify: (fieldValue: any[] | string | number) => string = (f: string) => f;

  constructor(shouldOverwrite?: boolean) {
    this.shouldOverwrite = !!shouldOverwrite;
  }

  setToString(toString: (fieldValue: any) => string) {
    this.stringify = toString;
    return this;
  }
}

// TODO: use a decorator to define `InterestingFields` instead of making an object for it manually.
// export const InterestingFieldDecorator = ({
//   shouldOverwrite = false,
//   toString,
// }: {
//   shouldOverwrite?: boolean;
//   toString?: (fieldValue: any[]) => string;
// }) => {
//   return Reflect.metadata('InterestingField', new InterestingField(shouldOverwrite).setToString(toString));
// };

export const InterestingFields = {
  opportunity_provider_name: new InterestingField(),
  opportunity_issuer_name: new InterestingField(),

  program_name: new InterestingField(),
  program_description: new InterestingField(),

  link_to_application: new InterestingField(),

  application_opening_date: new InterestingField(true),
  application_deadline: new InterestingField(true),

  company_eligibility_requirements: new InterestingField().setToString(f => f?.join(' \r\n+') || ''),
  eligible_activities: new InterestingField().setToString(f => f?.join(' \r\n+') || ''),

  role_eligibility_requirements: new InterestingField().setToString(f => f?.join(' \r\n+') || ''),
  candidate_requirement_tags: new InterestingField().setToString(f => JSON.stringify(f?.map((f: string) => ({ name: f })) || [])),

  opportunity_value_proposition: new InterestingField(),
  opportunitys_grant_types: new InterestingField().setToString(f => JSON.stringify(f?.map((f: string) => ({ type: f })) || [])),
  eligibility_requirements: new InterestingField().setToString(f => JSON.stringify(f?.map((f: string) => ({ name: f })) || [])),
  project_eligibility: new InterestingField().setToString(f => f?.join(' \r\n+') || ''),

  application_country: new InterestingField(),
  provinces: new InterestingField(),
  provinces_abbreviations: new InterestingField(),
  municipalities: new InterestingField().setToString(f => JSON.stringify(f?.map((f: string) => ({ name: f })) || [])),

  company_size_requirements: new InterestingField(),
  company_revenue_requirements: new InterestingField(),

  ineligibility_reasons: new InterestingField().setToString(f => f?.join(' \r\n+') || ''),

  cash_upfront: new InterestingField(),

  company_reporting_requirements: new InterestingField(),

  industries: new InterestingField().setToString(f => JSON.stringify(f?.map((f: string) => ({ name: f })) || [])),

  opportunity_categories: new InterestingField().setToString(f => JSON.stringify(f?.map((f: string) => ({ name: f })) || [])),
  opportunity_subcategories: new InterestingField().setToString(f => JSON.stringify(f?.map((f: string) => ({ name: f })) || [])),
  keywords: new InterestingField().setToString(f => JSON.stringify(f?.map((f: string) => ({ name: f })) || [])),

  funding_amount: new InterestingField().setToString(f => f?.toString() ?? ''),

  application_process_type: new InterestingField().setToString(f => JSON.stringify(f?.map((f: string) => ({ type: f })) || [])),
  application_process_time: new InterestingField(true),

  opportunity_insights: new InterestingField().setToString(f => JSON.stringify(f?.map((f: string) => ({ detail: f })) || [])),
};

export type InterestingFieldsKeys = keyof typeof InterestingFields;

export const interestingFields = InterestingFields as Record<InterestingFieldsKeys, InterestingField>;

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
    enum: AutoScraperQueueStatusEnum,
    default: AutoScraperQueueStatusEnum.PENDING,
  })
  status: AutoScraperQueueStatusEnum;

  @Prop({ type: [SchemaMongoose.Types.String] })
  logs: string[];

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
    'where `link_to_application` is a link to the application page where applicants can start applying on. empty string if not available.',
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
  company_eligibility_requirements: Field<string[]> = new Field(
    'string[]',
    'where `company_eligibility_requirements` is an array of strings,' +
      ' phrasing what the eligibility requirements are for the company applying for this opportunity',
  );

  @Prop({ type: FieldSchema })
  role_eligibility_requirements: Field<string[]> = new Field(
    'string[]',
    'where `role_eligibility_requirements` is an array of strings,' +
      ' phrasing who can be eligible and what advantages there are for them, applying for this opportunity.',
  );

  @Prop({ type: FieldSchema })
  candidate_requirement_tags: Field<string[]> = new Field(
    'string[]',
    'where `candidate_requirement_tags` is an array of strings, ' +
      'indicating some tags that describe the candidate who is eligible for this opportunity.',
  );

  @Prop({ type: FieldSchema })
  eligibility_requirements: Field<string[]> = new Field(
    'string[]',
    'where `eligibility_requirements` is an array of strings, phrasing what the eligibility requirements are for this opportunity.',
  );

  @Prop({ type: FieldSchema })
  eligible_activities: Field<string[]> = new Field(
    'string[]',
    'where `eligible_activities` is an array of strings, phrasing what the eligible activities are for this opportunity.',
  );

  @Prop({ type: FieldSchema })
  project_eligibility: Field<string[]> = new Field(
    'string[]',
    'where `project_eligibility` is an array of strings, phrasing what types of project are eligible for this opportunity.',
  );

  @Prop({ type: FieldSchema })
  application_country: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  provinces: Field<string[]> = new Field('string[]');
  @Prop({ type: FieldSchema })
  provinces_abbreviations: Field<string[]> = new Field(
    'string[]',
    'where `provinces_abbreviations` is an array of strings based on `provinces`, phrasing the alpha code abbreviations of the provinces. e.g. `["ON", "QC"]` based on the `provinces` field.',
  );

  @Prop({ type: FieldSchema })
  municipalities: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  company_size_requirements: Field<number[]> = new Field(
    'number[]',
    'where `company_size_requirements` is an array of two numbers, phrasing the minimum and maximum number of employees the company should have.',
  );

  @Prop({ type: FieldSchema })
  company_revenue_requirements: Field<string[]> = new Field(
    'string[]',
    'where `company_revenue_requirements` is an array of two strings, phrasing the minimum and maximum revenue the company should have.',
  );

  @Prop({ type: FieldSchema })
  ineligibility_reasons: Field<string[]> = new Field(
    'string[]',
    'where `ineligibility_reasons` is an array of strings, identifying the reasons for disqualification pertaining to this opportunity.',
  );

  @Prop({ type: FieldSchema })
  cash_upfront: Field<boolean | null> = new Field(
    'boolean',
    'where `cash_upfront` is a boolean or null for "not enough information", indicating whether the opportunity gives cash upfront or not.',
  );

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
  opportunity_categories: Field<string[]> = new Field(
    'string[]',
    'where `opportunity_categories` is an array of strings, phrasing what categories this opportunity falls under.' +
      ' Examples are: "First come first serve grants", "Hiring contractors or freelancers (not on payroll)", "A marketing project", etc.',
  );

  @Prop({ type: FieldSchema })
  opportunity_subcategories: Field<string[]> = new Field(
    'string[]',
    'where `opportunity_subcategories` is an array of strings, phrasing what subcategories this opportunity falls under.',
  );

  @Prop({ type: FieldSchema })
  keywords: Field<string[]> = new Field('string[]', 'where `keywords` is an array of strings, phrasing what keywords this opportunity falls under.');

  @Prop({ type: FieldSchema })
  funding_amount: Field<number> = new Field('number');

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
