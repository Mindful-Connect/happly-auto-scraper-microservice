import { HydratedDocument, Schema as SchemaMongoose } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { getMySQLDateFormatUTC } from '../utils/helperFunctions';

export type OpportunitySchema = HydratedDocument<Opportunity>;

@Schema()
export class Opportunity {
  constructor(partial?: Partial<Opportunity>) {
    Object.assign(this, partial);
  }

  @Prop({ type: null })
  url: string;

  /**
   * Whether the opportunity is a client rendered page or not. If true, puppeteer will be used to
   * scrape the HTML body of the page. If not, cheerios will be used as the it is a static page.
   */
  @Prop({ type: SchemaMongoose.Types.Boolean })
  clientRenderedPage: boolean;

  /**
   * Shows whether the auto-extraction needs manual review or not. If true, it means the scraper
   * could not extract every field and the admin needs to manually review the opportunity.
   * If false, it means the scraper was able to extract every field.
   */
  @Prop({ type: SchemaMongoose.Types.Boolean, default: false })
  corruptedExtraction: boolean;

  @Prop({ default: getMySQLDateFormatUTC() })
  submittedAt: string;
}

export const OpportunitySchema = SchemaFactory.createForClass(Opportunity);
