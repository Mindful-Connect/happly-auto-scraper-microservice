import { IsEnum, IsString } from 'class-validator';
import { AutoScraperQueueStatusEnum } from '@/auto-scraper/enums/autoScraperQueueStatus.enum';

export class UpdateQueueItemRequestDto {
  @IsString()
  queueId: string;

  @IsEnum(AutoScraperQueueStatusEnum)
  status: AutoScraperQueueStatusEnum;

  @IsString()
  errorDetails: string;

  toSnakeCase(): object {
    return {
      queue_id: this.queueId,
      status: this.status,
      error_details: this.errorDetails,
    };
  }

  constructor(partial?: Partial<UpdateQueueItemRequestDto>) {
    Object.assign(this, partial);
  }
}
