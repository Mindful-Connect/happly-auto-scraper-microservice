import { IsArray, IsUrl } from 'class-validator';

export class SubmitURLsRequestDto {
  @IsArray()
  @IsUrl(undefined, { each: true })
  urls: string[];

  constructor(partial?: Partial<SubmitURLsRequestDto>) {
    Object.assign(this, partial);
  }
}
