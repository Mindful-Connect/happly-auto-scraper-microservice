import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExtractionProcessUpdateDto } from './src/dtos/response/extractionProcessUpdate.dto';
import { OpportunityEventNamesEnum } from './src/enums/opportunityEventNames.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ProcessLogger {
  private shouldLogInfo = true;
  constructor(private configService: ConfigService, private eventEmitter: EventEmitter2) {
    this.shouldLogInfo = this.configService.get<boolean>('NEST_DEBUG') ?? false;
  }

  broadcast(payload: ExtractionProcessUpdateDto) {
    if (payload.detail) this.info(payload.detail);

    this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionProcessUpdate, payload);
  }

  info(...message: any[]) {
    if (!this.shouldLogInfo) return;
    console.info(...message);
  }
}
