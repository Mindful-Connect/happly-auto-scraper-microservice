import { AutoScraperQueueStatusEnum } from '@/auto-scraper/enums/autoScraperQueueStatus.enum';
import { QueueItemSourceEnum } from '@/happly/enums/queueItemSource.enum';

export interface QueuedOpportunitiesApiResponseDto {
  id: number;
  url: string;
  name: string | null;
  queue_id: string;
  status: AutoScraperQueueStatusEnum;
  source: QueueItemSourceEnum;
  error_details: string | null;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
