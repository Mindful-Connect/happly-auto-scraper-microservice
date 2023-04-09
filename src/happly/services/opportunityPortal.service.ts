import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ExtractedOpportunityDocument } from '@/app/schemas/extractedOpportunity.schema';
import { UpdateQueueItemRequestDto } from '../dtos/request/updateQueueItem.request.dto';

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

      console.log('updateQueuedOpportunity response', response);
    } catch (e) {
      console.error('updateQueuedOpportunity response', e);
    }
  }

  async submitNewScrapedOpportunity(extractedOpportunityDocument: ExtractedOpportunityDocument) {
    try {
    } catch (e) {}
  }
}
