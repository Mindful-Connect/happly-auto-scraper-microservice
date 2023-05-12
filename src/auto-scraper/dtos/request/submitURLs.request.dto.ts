import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { QueueItemSourceEnum } from '@/happly/enums/queueItemSource.enum';

export class QueueItem {
  @IsUrl()
  url: string;

  @IsString()
  @IsOptional()
  name = 'Unnamed';

  @IsString()
  @IsNotEmpty()
  queueId: string;

  @IsEnum(QueueItemSourceEnum)
  source: QueueItemSourceEnum;
}

export class SubmitURLsRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QueueItem)
  queueItems: QueueItem[];

  constructor(partial?: Partial<SubmitURLsRequestDto>) {
    Object.assign(this, partial);
  }
}
