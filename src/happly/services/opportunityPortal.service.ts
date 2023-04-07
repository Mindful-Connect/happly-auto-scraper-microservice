import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { catchError, firstValueFrom, of } from 'rxjs';
import { AxiosError } from 'axios';
import { ConfigService } from '@nestjs/config';
import { ExtractedOpportunityDocument } from '../../app/schemas/extractedOpportunity.schema';

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
    const { data } = await firstValueFrom(
      this.httpService
        .get(`${this.url}/opportunities`, {
          headers: {
            Authorization: 'Bearer ' + this.token,
          },
        })
        .pipe(catchError((error: AxiosError) => of(error.response))),
    );

    console.log('data', data);
    return data;
  }

  async updateQueuedOpportunity(extractedOpportunityDocument: ExtractedOpportunityDocument) {
    const response = await this.httpService.axiosRef.post(
      `${this.url}/opportunities/queued`,
      {
        queueId: extractedOpportunityDocument.queueId,
        errorDetails: extractedOpportunityDocument.errorDetails,
      },
      {
        headers: {
          Authorization: 'Bearer ' + this.token,
        },
      },
    );

    console.log('updateQueuedOpportunity response', response);
  }
}
