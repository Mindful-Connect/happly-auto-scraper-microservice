import { ExpiredOpportunityScrapingStatusEnum } from '@/expired-opportunity/enums/expiredOpportunityScrapingStatus.enum';

export class ExpiredOpportunityResponseDto {
  syncId: string;

  url: string;

  status: ExpiredOpportunityScrapingStatusEnum;

  deadline: string;

  isPermanentlyClosed: boolean;

  constructor(required?: Required<ExpiredOpportunityResponseDto>) {
    Object.assign(this, required);
  }
}
