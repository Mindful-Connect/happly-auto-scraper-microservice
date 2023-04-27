import { Injectable } from '@nestjs/common';
import { ExtractedOpportunity, ExtractedOpportunityDocument, interestingFields } from '@/extracted-opportunity/schemas/extractedOpportunity.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ScrapedOpportunityDto } from '@/happly/dtos/scrapedOpportunity.dto';
import { saveSafely } from '@/_domain/helpers/mongooseHelpers';
import { isValidUrl, reassembleUrl } from '@/_domain/helpers/helperFunctions';

@Injectable()
export class ExtractedOpportunityRepository {
  constructor(
    @InjectModel(ExtractedOpportunity.name)
    private extractedOpportunityModel: Model<ExtractedOpportunityDocument>,
  ) {}

  async createOpportunity(extractedOpportunity: ExtractedOpportunity) {
    const createdDoc = new this.extractedOpportunityModel(extractedOpportunity);
    await saveSafely(createdDoc);
    return createdDoc;
  }

  async getOpportunities(): Promise<ExtractedOpportunity[]> {
    return await this.extractedOpportunityModel.find().exec();
  }

  async findOpportunityByURL(url: string) {
    return await this.extractedOpportunityModel.findOne({ url }).exec();
  }

  async findOpportunityByQueueId(queueId: string): Promise<ExtractedOpportunityDocument | null> {
    return await this.extractedOpportunityModel.findOne({ queueId }).exec();
  }

  async getScrapedOpportunityByQueueId(queueId: string): Promise<ScrapedOpportunityDto | null> {
    const doc = await this.findOpportunityByQueueId(queueId);
    if (!doc) return null;
    return await this.getScrapedOpportunityDto(doc);
  }

  async getScrapedOpportunityDto(doc: ExtractedOpportunityDocument) {
    return new ScrapedOpportunityDto({
      source_id: doc.queueId,
      name: doc.program_name.data,
      program_site: doc.url,
      app_link: !isValidUrl(doc.link_to_application.data) ? reassembleUrl(doc.url, doc.link_to_application.data) : doc.link_to_application.data,
      provider: doc.opportunity_provider_name.data,
      description: doc.program_description.data,
      value: doc.opportunity_value_proposition.data,
      amount: interestingFields.funding_amount.stringify(doc.funding_amount.data),
      open_date: doc.application_opening_date.data,
      deadlines: doc.application_deadline_date.data,
      process_time: doc.application_process_time.data,
      comp_req: interestingFields.company_eligibility_requirements.stringify(doc.company_eligibility_requirements.data), // TODO
      project_eligibility: interestingFields.project_eligibility.stringify(doc.project_eligibility.data), // TODO
      ineligibility: interestingFields.ineligibility_reasons.stringify(doc.ineligibility_reasons.data), // TODO
      eligible_activities: interestingFields.eligible_activities.stringify(doc.eligible_activities.data),
      eligibility_candidates: '', // TODO (this has been empty in the portal)
      role_req: interestingFields.role_eligibility_requirements.stringify(doc.role_eligibility_requirements.data), // TODO
      app_req: interestingFields.application_process_instructions.stringify(doc.application_process_instructions.data), // TODO
      cash_up: doc.cash_upfront.data !== null ? (doc.cash_upfront.data ? '1' : '0') : null, // TODO
      company_size_min_req:
        Array.isArray(doc.company_size_requirements.data) &&
        doc.company_size_requirements.data[0] !== undefined &&
        !isNaN(doc.company_size_requirements.data[0])
          ? doc.company_size_requirements.data[0]
          : '0', // TODO
      company_size_max_req:
        Array.isArray(doc.company_size_requirements.data) &&
        doc.company_size_requirements.data[1] !== undefined &&
        !isNaN(doc.company_size_requirements.data[1])
          ? doc.company_size_requirements.data[1]
          : '', // TODO
      revenue_min_req:
        Array.isArray(doc.company_revenue_requirements.data) &&
        doc.company_revenue_requirements.data[0] !== undefined &&
        !isNaN(parseInt(doc.company_revenue_requirements.data[0]))
          ? doc.company_revenue_requirements.data[0]
          : '0', // TODO
      revenue_max_req:
        Array.isArray(doc.company_revenue_requirements.data) &&
        doc.company_revenue_requirements.data[1] !== undefined &&
        !isNaN(parseInt(doc.company_revenue_requirements.data[1]))
          ? doc.company_revenue_requirements.data[1]
          : null, // TODO
      grant_type: interestingFields.opportunitys_grant_types.stringify(doc.opportunitys_grant_types.data),
      country: doc.application_country.data ?? '',
      region:
        Array.isArray(doc.provinces.data) && doc.provinces.data.length > 0
          ? JSON.stringify(
              doc.provinces.data.map((p, i) => ({
                name: p,
                abbreviation: Array.isArray(doc.provinces_abbreviations.data) ? doc.provinces_abbreviations.data[i] ?? '' : '',
                country: 1,
              })),
            )
          : '[]',
      region_tags: interestingFields.municipalities.stringify(doc.municipalities.data),
      candidate_req_tags: interestingFields.candidate_requirement_tags.stringify(doc.candidate_requirement_tags.data), // TODO
      subcategories: interestingFields.opportunity_categories.stringify(doc.opportunity_categories.data), // TODO
      subcategories_tags: interestingFields.opportunity_subcategories.stringify(doc.opportunity_subcategories.data), // TODO
      industry: interestingFields.industries.stringify(doc.industries.data),
      keywords: interestingFields.keywords.stringify(doc.keywords.data),
      app_type: interestingFields.application_process_type.stringify(doc.application_process_type.data),
      business_type_req: interestingFields.business_type_requirements.stringify(doc.business_type_requirements.data), // TODO
      role_type_tags: interestingFields.role_type_tags.stringify(doc.role_type_tags.data), // TODO
      role_length_tags: interestingFields.role_length_tags.stringify(doc.role_length_tags.data), // TODO
      project_activities_tags: interestingFields.role_length_tags.stringify(doc.project_activities_tags.data), // TODO
      project_length_tags: interestingFields.project_length_tags.stringify(doc.project_length_tags.data), // TODO
      insights: interestingFields.opportunity_insights.stringify(doc.opportunity_insights.data),
    });
  }
}
