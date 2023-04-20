import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ExtractedOpportunityDocument } from '@/app/schemas/extractedOpportunity.schema';
import { UpdateQueueItemRequestDto } from '../dtos/request/updateQueueItem.request.dto';
import { ScrapedOpportunityDto } from '@/happly/dtos/scrapedOpportunity.dto';
import { ExtractedOpportunityRepository } from '@/app/repositories/extractedOpportunity.repository';

@Injectable()
export class OpportunityPortalService {
  /**
   * The URL of the Happly Opportunity Portal API
   * @private
   */
  private url: string;

  private token: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly extractedOpportunityRepository: ExtractedOpportunityRepository,
  ) {
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
      scrapedOpportunityDto = await this.extractedOpportunityRepository.getScrapedOpportunityDto(extractedOpportunityDocument);

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
