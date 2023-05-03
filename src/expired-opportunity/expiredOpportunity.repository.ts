import { Injectable } from '@nestjs/common';
import { ExpiredOpportunity, ExpiredOpportunityDocument } from '@/expired-opportunity/expiredOpportunity.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { saveSafely } from '@/_domain/helpers/mongooseHelpers';

@Injectable()
export class ExpiredOpportunityRepository {
  constructor(
    @InjectModel(ExpiredOpportunity.name)
    public model: Model<ExpiredOpportunityDocument>,
  ) {}

  async create(expiredOpportunity: ExpiredOpportunity) {
    const createdDoc = new this.model(expiredOpportunity);
    await saveSafely(createdDoc, 0);
    return createdDoc;
  }

  async findAll() {
    return await this.model.find().exec();
  }
}
