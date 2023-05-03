import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Field, FieldSchema } from './field.schema';
import { HydratedDocument, Schema as SchemaMongoose } from 'mongoose';
import { convertToKebabCase, getMySQLDateFormatUTC } from '@/_domain/helpers/helperFunctions';
import { AutoScraperQueueStatusEnum } from '@/auto-scraper/enums/autoScraperQueueStatus.enum';
import { QueueItemSourceEnum } from '@/happly/enums/queueItemSource.enum';
import { InterestingField } from '@/auto-scraper/models/interestingField.model';

export type ExtractedOpportunityDocument = HydratedDocument<ExtractedOpportunity>;

export const overwritableFields = ['application_opening_date', 'application_deadline_date', 'application_process_time'] as const;

type ToStringDelegate = (f: string[]) => string;
const tagsToStringDelegate: ToStringDelegate = f => JSON.stringify(f?.map((f: string) => ({ name: f, slug: convertToKebabCase(f) })) || []);
const arraysToStringWithTypePropDelegate: ToStringDelegate = f => JSON.stringify(f?.map((f: string) => ({ type: f })) || []);
const arraysToStringWithNamePropDelegate: ToStringDelegate = f => JSON.stringify(f?.map((f: string) => ({ name: f })) || []);
const arraysToStringWithNewLineDelegate: ToStringDelegate = f => f?.join(' \r\n+') || '';

const InterestingFields = {
  opportunity_provider_name: new InterestingField(),
  opportunity_issuer_name: new InterestingField(),

  program_name: new InterestingField(),
  program_description: new InterestingField(
    'where `program_description` is a description of the program described in 1000 characters (max) or less.',
  ),

  link_to_application: new InterestingField(
    'where `link_to_application` is a link to the application page where applicants can start applying on. empty string if not available.',
  ),

  application_opening_date: new InterestingField(),
  application_deadline_date: new InterestingField(
    'where `application_deadline_date` is the date when the application closes. Date is in YYYY-MM-DD format if available. ' +
      'is "Closed" if the application is closed, expired, or is in the past. is "Open Until Filled" if open but not mentioned. is empty string if not available',
  ),

  company_eligibility_requirements: new InterestingField(
    'where `company_eligibility_requirements` is an array of strings,' +
      ' phrasing what the eligibility requirements are for the company applying for this opportunity',
  ).setToString(arraysToStringWithNewLineDelegate),
  eligible_activities: new InterestingField(
    'where `eligible_activities` is an array of strings, phrasing what the eligible activities are for this opportunity.',
  ).setToString(arraysToStringWithNewLineDelegate),

  role_eligibility_requirements: new InterestingField(
    'where `role_eligibility_requirements` is an array of strings,' +
      ' phrasing who can be eligible and what advantages there are for them, applying for this opportunity.',
  ).setToString(arraysToStringWithNewLineDelegate),
  application_process_instructions: new InterestingField(
    'where `application_process_instructions` is an array of imperative sentences, instructing the applicant on how to apply for this opportunity.',
  ).setToString(arraysToStringWithNewLineDelegate),
  candidate_requirement_tags: new InterestingField(
    'where `candidate_requirement_tags` is an array of strings, ' +
      'indicating some tags that describe the candidate who is eligible for this opportunity.',
  ).setToString(arraysToStringWithNamePropDelegate),

  opportunity_value_proposition: new InterestingField(),
  opportunitys_grant_types: new InterestingField(
    'where `opportunitys_grant_types` is an array of strings, phrasing what types of grants this opportunity gives the applicants.',
  ).setToString(arraysToStringWithTypePropDelegate),
  eligibility_requirements: new InterestingField(
    'where `eligibility_requirements` is an array of strings, phrasing what the eligibility requirements are for this opportunity.',
  ).setToString(arraysToStringWithNamePropDelegate),
  project_eligibility: new InterestingField(
    'where `project_eligibility` is an array of strings, phrasing what types of project are eligible for this opportunity.',
  ).setToString(arraysToStringWithNewLineDelegate),

  application_country: new InterestingField(),
  provinces: new InterestingField(),
  provinces_abbreviations: new InterestingField(
    'where `provinces_abbreviations` is an array of strings based on `provinces`, phrasing the alpha code abbreviations of the provinces. e.g. `["ON", "QC"]` based on the `provinces` field.',
  ),
  municipalities: new InterestingField().setToString(arraysToStringWithNamePropDelegate),

  company_size_requirements: new InterestingField(
    'where `company_size_requirements` is an array of two numbers, phrasing the minimum and maximum number of employees the company should have.',
  ),
  company_revenue_requirements: new InterestingField(
    'where `company_revenue_requirements` is an array of two strings, phrasing the minimum and maximum revenue the company should have.',
  ),

  ineligibility_reasons: new InterestingField(
    'where `ineligibility_reasons` is an array of strings, identifying the reasons for disqualification pertaining to this opportunity.',
  ).setToString(arraysToStringWithNewLineDelegate),

  cash_upfront: new InterestingField(
    'where `cash_upfront` is a boolean or null for "not enough information", indicating whether the opportunity gives cash upfront or not.',
  ),

  company_reporting_requirements: new InterestingField(),

  industries: new InterestingField(
    'where `industries` is an array of strings, phrasing what industries this opportunity falls under.' +
      ' Examples are: "Agriculture", "Biotechnology", "Film/Music/Entertainment", Manufacturing", "Technology", "Educational Services", "Mining",' +
      ' "Artificial Intelligence", "Food Processing", "Healthcare", "Information/Communications Technology", "Environmental Sustainability"',
  ).setToString(arraysToStringWithNamePropDelegate),

  opportunity_categories: new InterestingField(
    'where `opportunity_categories` is an array of strings, phrasing what categories this opportunity falls under.' +
      ' Examples are: "First come first serve grants", "Hiring contractors or freelancers (not on payroll)", "A marketing project", etc.',
  ).setToString(arraysToStringWithNamePropDelegate),
  opportunity_subcategories: new InterestingField(
    'where `opportunity_subcategories` is an array of strings, phrasing what subcategories this opportunity falls under.',
  ).setToString(arraysToStringWithNamePropDelegate),
  keywords: new InterestingField('where `keywords` is an array of strings, phrasing what keywords this opportunity falls under.').setToString(
    arraysToStringWithNamePropDelegate,
  ),

  funding_amount: new InterestingField().setToString(f => f?.toString() ?? ''),

  application_process_type: new InterestingField(
    'where `application_process_type` is an array of all the possible ways to apply for this program. Possible values are: "online form", "contacting representatives", or "email submission"',
  ).setToString(arraysToStringWithTypePropDelegate),
  application_process_time: new InterestingField(
    'where `application_process_time` is the time it takes to process an application. Possible values are: ' + '"Long", "Moderate", "Quick"',
  ),

  opportunity_insights: new InterestingField(
    'where `opportunity_insights` is an array of brief statements that provide essential information ' +
      'and considerations about opportunities, enabling applicants to grasp key aspects of these opportunities simply by reviewing these summarized points. ' +
      'Example: `["The following companies are eligible:", "Companies with less than 1 million in revenue", "It’s rare ' +
      'to find a grant that funds day-to-day operations. We need to find ways to frame our daily work as projects with clear objectives and timeframes. It’s likely ' +
      'you already have metrics for your projects, you may just not have thought about it in these terms!"]`',
  ).setToString(f => JSON.stringify(f?.map((f: string) => ({ detail: f })) || [])),

  business_type_requirements: new InterestingField(
    'where `business_type_requirements` is an array of strings, containing the keywords indicating the eligible business types for this opportunity.',
  ).setToString(arraysToStringWithTypePropDelegate),
  role_length_tags: new InterestingField(
    "where `role_length_tags` is an array of strings, containing the keywords indicating the eligible applicant's role lengths for this opportunity.",
  ).setToString(tagsToStringDelegate),
  role_type_tags: new InterestingField(
    "where `role_type_tags` is an array of strings, containing the keywords indicating the eligible applicant's role types for this opportunity.",
  ).setToString(tagsToStringDelegate),
  project_activities_tags: new InterestingField(
    'where `project_activities_tags` is an array of strings, containing the keywords indicating the eligible project activities for this opportunity.',
  ).setToString(tagsToStringDelegate),
  project_length_tags: new InterestingField(
    'where `project_length_tags` is an array of strings, containing the keywords indicating the eligible project lengths in period for this opportunity.' +
      ' Possible values are: "Short Term", "Long Term", "Continuous"',
  ).setToString(tagsToStringDelegate),
};

type InterestingFieldsKeys = keyof typeof InterestingFields;

export const interestingFields = InterestingFields as Record<InterestingFieldsKeys, InterestingField>;

@Schema()
export class ExtractedOpportunity {
  constructor(partial?: Partial<ExtractedOpportunity>) {
    Object.assign(this, partial);
  }

  // <editor-fold desc="Meta data of Opportunity">
  /**
   * The Queue ID of the opportunity. Used to identify the opportunity
   * among the admin portal and the core API. In case of submission,
   * this will be the same as the `source_id` in the admin portal scraped_opportunities table.
   */
  @Prop({ type: SchemaMongoose.Types.String, required: true })
  queueId: string;

  @Prop({ type: null })
  url: string;

  @Prop({ type: SchemaMongoose.Types.String })
  name: string;

  @Prop({ type: SchemaMongoose.Types.String, enum: QueueItemSourceEnum, default: QueueItemSourceEnum.Pocket })
  source: QueueItemSourceEnum;

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
  // </editor-fold>

  // <editor-fold desc="Fields">
  @Prop({ type: FieldSchema })
  opportunity_provider_name: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  opportunity_issuer_name: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  program_name: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  program_description: Field<string> = new Field('string');

  @Prop({ type: FieldSchema })
  link_to_application: Field<string> = new Field('string');

  @Prop({ type: FieldSchema })
  application_opening_date: Field<string> = new Field('date');

  @Prop({ type: FieldSchema })
  application_deadline_date: Field<string> = new Field('date');

  @Prop({ type: FieldSchema })
  opportunity_value_proposition: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  opportunitys_grant_types: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  company_eligibility_requirements: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  role_eligibility_requirements: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  candidate_requirement_tags: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  eligibility_requirements: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  eligible_activities: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  project_eligibility: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  application_country: Field<string> = new Field();

  @Prop({ type: FieldSchema })
  provinces: Field<string[]> = new Field('string[]');
  @Prop({ type: FieldSchema })
  provinces_abbreviations: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  municipalities: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  company_size_requirements: Field<number[]> = new Field('number[]');

  @Prop({ type: FieldSchema })
  company_revenue_requirements: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  ineligibility_reasons: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  cash_upfront: Field<boolean | null> = new Field('boolean');

  @Prop({ type: FieldSchema })
  company_reporting_requirements: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  application_process_instructions: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  industries: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  opportunity_categories: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  opportunity_subcategories: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  keywords: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  funding_amount: Field<number> = new Field('number');

  @Prop({ type: FieldSchema })
  application_process_type: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  application_process_time: Field<string> = new Field('string');

  @Prop({ type: FieldSchema })
  business_type_requirements: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  role_length_tags: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  role_type_tags: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  project_activities_tags: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  project_length_tags: Field<string[]> = new Field('string[]');

  @Prop({ type: FieldSchema })
  opportunity_insights: Field<string[]> = new Field('string[]');

  // </editor-fold>

  @Prop({ default: null })
  submittedAt: string;

  @Prop({ default: getMySQLDateFormatUTC() })
  createdAt: string;

  @Prop({ default: getMySQLDateFormatUTC() })
  updatedAt: string;
}

export const ExtractedOpportunitySchema = SchemaFactory.createForClass(ExtractedOpportunity);

ExtractedOpportunitySchema.pre('save', function (next) {
  const extractedOpportunity = this as ExtractedOpportunityDocument;

  const now = getMySQLDateFormatUTC();
  if (!extractedOpportunity.createdAt) {
    extractedOpportunity.createdAt = now;
  }
  extractedOpportunity.updatedAt = now;
  next();
});
