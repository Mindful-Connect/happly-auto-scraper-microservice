import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as SchemaMongoose } from 'mongoose';
import { getMySQLDateFormatUTC } from '@/_domain/helpers/helperFunctions';
import { Field, FieldSchema } from '@/extracted-opportunity/schemas/field.schema';
import { ExpiredOpportunityScrapingStatusEnum, StatusToPriorityMap } from '@/expired-opportunity/enums/expiredOpportunityScrapingStatus.enum';
import { InterestingField } from '@/auto-scraper/models/interestingField.model';

export type ExpiredOpportunityDocument = HydratedDocument<ExpiredOpportunity>;

const InterestingFields = {
  application_deadline_date: new InterestingField(
    'where `application_deadline_date` is the date when the application closes. Date is in YYYY-MM-DD format if available. ' +
      'is "Permanently Closed" if the application is permanently closed and will not open again. ' +
      'is "Open Until Filled" if the application is open but deadline is not mentioned. ' +
      'is null if there are not enough information in this page.',
  ),
};

type InterestingFieldsKeys = keyof typeof InterestingFields;

export const interestingFields = InterestingFields as Record<InterestingFieldsKeys, InterestingField>;

@Schema()
export class ExpiredOpportunity {
  constructor(partial?: Partial<ExpiredOpportunity>) {
    Object.assign(this, partial);
  }

  @Prop({ required: true, unique: true })
  syncId: string;

  @Prop()
  url: string;

  @Prop({
    type: SchemaMongoose.Types.String,
    enum: ExpiredOpportunityScrapingStatusEnum,
    default: ExpiredOpportunityScrapingStatusEnum.Processing,
  })
  status: ExpiredOpportunityScrapingStatusEnum;

  @Prop({ type: SchemaMongoose.Types.Number })
  priorityStatus: number;

  @Prop({ type: [SchemaMongoose.Types.String] })
  logs: string[];

  @Prop({ type: FieldSchema })
  application_deadline_date: Field<string> = new Field('date');

  @Prop({ type: SchemaMongoose.Types.Boolean, default: null })
  clientRenderedPage = null;

  @Prop({ type: SchemaMongoose.Types.Boolean })
  isPermanentlyClosed = false;

  @Prop({ type: SchemaMongoose.Types.Number })
  failedToFetchPageCount = 0;

  @Prop({ type: SchemaMongoose.Types.String })
  errorDetails?: string;

  @Prop({ type: SchemaMongoose.Types.String })
  originalCreatedAt: string;

  @Prop({ type: SchemaMongoose.Types.Date, default: null })
  lastScrapedAt: Date | null = null;

  @Prop({ default: getMySQLDateFormatUTC() })
  createdAt: string;

  @Prop({ default: getMySQLDateFormatUTC() })
  updatedAt: string;
}

export const ExpiredOpportunitySchema = SchemaFactory.createForClass(ExpiredOpportunity);

ExpiredOpportunitySchema.pre('save', function (next) {
  const expiredOpportunity = this as ExpiredOpportunityDocument;

  expiredOpportunity.priorityStatus = StatusToPriorityMap[expiredOpportunity.status];

  const now = getMySQLDateFormatUTC();
  if (!expiredOpportunity.createdAt) {
    expiredOpportunity.createdAt = now;
  }
  expiredOpportunity.updatedAt = now;
  next();
});
