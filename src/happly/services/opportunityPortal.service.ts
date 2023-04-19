import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import {
  ExtractedOpportunityDocument,
  InterestingField,
  interestingFields,
  InterestingFields,
  InterestingFieldsKeys,
} from '@/app/schemas/extractedOpportunity.schema';
import { UpdateQueueItemRequestDto } from '../dtos/request/updateQueueItem.request.dto';
import { ScrapedOpportunityDto } from '@/happly/dtos/scrapedOpportunity.dto';

@Injectable()
export class OpportunityPortalService {
  /**
   * The URL of the Happly Opportunity Portal API
   * @private
   */
  private url: string;

  private token: string;

  constructor(private readonly httpService: HttpService, private configService: ConfigService) {
    this.url = this.configService.get<string>('HAPPLY_SYNC_API');
    this.token = this.configService.get<string>('HAPPLY_SYNC_TOKEN');
  }

  async getQueuedOpportunities() {
    try {
      const response = await this.httpService.axiosRef.get(`${this.url}/auto-scraper-queue`, {
        headers: {
          Authorization: 'Bearer ' + this.token,
        },
      });

      console.log('data', response);
      return response.data;
    } catch (e) {
      console.error('error', e);
      return [];
    }
  }

  async updateQueuedOpportunity(extractedOpportunityDocument: ExtractedOpportunityDocument) {
    try {
      const response = await this.httpService.axiosRef.put(
        `${this.url}/auto-scraper-queue`,
        new UpdateQueueItemRequestDto({
          queueId: extractedOpportunityDocument.queueId,
          status: extractedOpportunityDocument.status,
          errorDetails: extractedOpportunityDocument.errorDetails,
        }).toSnakeCase(),
        {
          headers: {
            Authorization: 'Bearer ' + this.token,
          },
        },
      );

      console.log('updateQueuedOpportunity successfully updated', response.data);
    } catch (e) {
      console.error('updateQueuedOpportunity response', e);
    }
  }

  async test() {
    const scrapedOpportunityDto = new ScrapedOpportunityDto({
      source_id: 'test',
      name: 'dfdafasdfsd',
      program_site: 'dsfadsf',
      app_link: 'sdfad',
      provider: 'asdads',
      description: 'adsfadsf',
      value: '',
      amount: '',
      open_date: '',
      deadlines: '',
      process_time: '',
      comp_req: '',
      project_eligibility: '',
      ineligibility: '',
      eligible_activities: '',
      eligibility_candidates: '',
      role_req: '',
      app_req: '',
      cash_up: '1',
      company_size_min_req: '',
      company_size_max_req: '',
      revenue_min_req: '',
      revenue_max_req: '',
      grant_type: '',
      country: '',
      region: '',
      region_tags: '',
      candidate_req_tags: '',
      subcategories: '',
      subcategories_tags: '',
      industry: '',
      keywords: '[]',
      app_type: '',
      business_type_req: '',
      role_type_tags: '',
      role_length_tags: '',
      project_activities_tags: '',
      project_length_tags: '',
      insights: '',
    });
    try {
      const response = await this.httpService.axiosRef.post(`${this.url}/opportunities/scraped`, scrapedOpportunityDto, {
        headers: {
          Authorization: 'Bearer ' + this.token,
          'Content-Type': 'application/json',
        },
      });
    } catch (e) {
      console.error('error', e);
    }
  }

  async submitNewScrapedOpportunity(extractedOpportunityDocument: ExtractedOpportunityDocument) {
    let scrapedOpportunityDto: ScrapedOpportunityDto;
    try {
      // improve readability
      const doc = extractedOpportunityDocument;

      scrapedOpportunityDto = new ScrapedOpportunityDto({
        source_id: doc.syncId,
        name: doc.program_name.data,
        program_site: doc.url,
        app_link: doc.link_to_application.data,
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
        app_req: '', // TODO
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
        region_tags: interestingFields.municipalities.stringify(doc.municipalities.data), // TODO
        candidate_req_tags: interestingFields.candidate_requirement_tags.stringify(doc.candidate_requirement_tags.data), // TODO
        subcategories: interestingFields.opportunity_categories.stringify(doc.opportunity_categories.data), // TODO
        subcategories_tags: interestingFields.opportunity_subcategories.stringify(doc.opportunity_subcategories.data), // TODO
        industry: interestingFields.industries.stringify(doc.industries.data),
        keywords: interestingFields.keywords.stringify(doc.keywords.data),
        app_type: interestingFields.application_process_type.stringify(doc.application_process_type.data),
        business_type_req: '[]', // TODO
        role_type_tags: '[]', // TODO
        role_length_tags: '[]', // TODO
        project_activities_tags: '[]', // TODO
        project_length_tags: '[]',
        insights: interestingFields.opportunity_insights.stringify(doc.opportunity_insights.data),
      });

      const response = await this.httpService.axiosRef.post(`${this.url}/opportunities/scraped`, scrapedOpportunityDto, {
        headers: {
          Authorization: 'Bearer ' + this.token,
          'Content-Type': 'application/json',
        },
      });

      console.log('submitNewScrapedOpportunity response', response);
    } catch (e) {
      console.error('submitNewScrapedOpportunity response', e);
    }
  }
}
