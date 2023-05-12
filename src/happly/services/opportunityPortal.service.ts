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
