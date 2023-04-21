import { AutoScraperQueueStatusEnum } from '@/auto-scraper/enums/autoScraperQueueStatus.enum';
import { QueueItemSourceEnum } from '@/happly/enums/QueueItemSource.enum';

export class OpportunityStatusDto {
  queueId: string;

  status: AutoScraperQueueStatusEnum;

  errorDetails: string;

  source: QueueItemSourceEnum;

  constructor(partial?: Required<OpportunityStatusDto>) {
    Object.assign(this, partial);
  }
}
