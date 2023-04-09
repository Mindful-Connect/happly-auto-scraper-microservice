import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExtractionProcessUpdateDto } from '../dtos/response/extractionProcessUpdate.dto';
import { OpportunityEventNamesEnum } from '../enums/opportunityEventNames.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ExtractedOpportunityDocument } from '@/app/schemas/extractedOpportunity.schema';

@Injectable()
export class ProcessLogger {
  private shouldLogInfo = true;
  constructor(private configService: ConfigService, private eventEmitter: EventEmitter2) {
    this.shouldLogInfo = this.configService.get<boolean>('NEST_DEBUG') ?? false;
  }

  private _extractedOpportunityDocument: ExtractedOpportunityDocument | null = null;
  set extractedOpportunityDocument(value: ExtractedOpportunityDocument) {
    this._extractedOpportunityDocument = value;
  }

  broadcast(payload: ExtractionProcessUpdateDto) {
    if (payload.detail) this.info(payload.detail);

    this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionProcessUpdate, payload);
  }

  info(...message: any[]) {
    if (this._extractedOpportunityDocument !== null) this._extractedOpportunityDocument.logs.push(message[0]);

    if (!this.shouldLogInfo) return;
    console.info(...message);
  }

  error(...message: any[]) {
    console.error(...message);
  }
}
