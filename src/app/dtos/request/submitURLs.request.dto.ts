import { IsArray, IsOptional, IsString, IsUrl, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class QueueItem {
  @IsUrl()
  url: string;

  @IsString()
  @IsOptional()
  name = 'Unnamed';

  @IsUUID()
  queueId: string;
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
