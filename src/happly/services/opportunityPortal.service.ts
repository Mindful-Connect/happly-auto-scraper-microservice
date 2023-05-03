import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ExtractedOpportunityDocument } from '@/extracted-opportunity/schemas/extractedOpportunity.schema';
import { UpdateQueueItemRequestDto } from '../dtos/request/updateQueueItem.request.dto';
import { ScrapedOpportunityDto } from '@/happly/dtos/scrapedOpportunity.dto';
import { ExtractedOpportunityRepository } from '@/extracted-opportunity/repositories/extractedOpportunity.repository';
import { ExpiredOpportunitiesApiResponseDto } from '@/happly/dtos/apiResponse/expiredOpportunities.apiResponse.dto';
import { QueuedOpportunitiesApiResponseDto } from '@/happly/dtos/apiResponse/queuedOpportunities.apiResponse.dto';
import { getMySQLDateFormatUTC } from '@/_domain/helpers/helperFunctions';

@Injectable()
export class OpportunityPortalService {
  /**
   * The URL of the Happly Opportunity Portal API
   * @private
   */
  private readonly url: string;

  private readonly token: string;

  private readonly authorizationHeaders: { Authorization: string };

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly extractedOpportunityRepository: ExtractedOpportunityRepository,
  ) {
    this.url = this.configService.get<string>('HAPPLY_SYNC_API');
    this.token = this.configService.get<string>('HAPPLY_SYNC_TOKEN');
    this.authorizationHeaders = {
      Authorization: 'Bearer ' + this.token,
    };
  }

  async getExpiredOpportunities(lastCreatedDate: string | null) {
    try {
      const response = await this.httpService.axiosRef.get<ExpiredOpportunitiesApiResponseDto[]>(
        `${this.url}/expired-opportunities/${lastCreatedDate || getMySQLDateFormatUTC()}`,
        {
          headers: {
            ...this.authorizationHeaders,
          },
        },
      );
      return response.data;
    } catch (e) {
      console.error('getExpiredOpportunities error', e);
    }
  }

  async getQueuedOpportunities() {
    try {
      const response = await this.httpService.axiosRef.get<QueuedOpportunitiesApiResponseDto[]>(`${this.url}/auto-scraper-queue`, {
        headers: {
          ...this.authorizationHeaders,
        },
      });

      console.log('data', response);
      return response.data;
    } catch (e) {
      console.error('getQueuedOpportunities error', e);
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
            ...this.authorizationHeaders,
          },
        },
      );

      console.log('updateQueuedOpportunity successfully updated', response.data);
    } catch (e) {
      console.error('updateQueuedOpportunity error', e);
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
          ...this.authorizationHeaders,
          'Content-Type': 'application/json',
        },
      });

      console.log('submitNewScrapedOpportunity response', response);
    } catch (e) {
      console.error('submitNewScrapedOpportunity error', e);
    }
  }
}
