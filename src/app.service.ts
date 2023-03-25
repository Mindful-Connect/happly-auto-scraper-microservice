import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ExtractedOpportunity,
  ExtractedOpportunityDocument,
} from './schemas/extractedOpportunitySchema';
import { Model } from 'mongoose';

@Injectable()
export class AppService {
  constructor(
    @InjectModel(ExtractedOpportunity.name)
    private opportunityModel: Model<ExtractedOpportunityDocument>,
  ) {}

  async helloMicroservice(): Promise<any> {
    const opportunity = new this.opportunityModel({
      opportunity_provider_name: {
        contextSlug: 'opportunity_provider_name',
        fieldType: 'string',
      },
    });
    return await opportunity.save();
  }

  async getOpportunities(): Promise<ExtractedOpportunity[]> {
    return await this.opportunityModel.find().exec();
  }
}
