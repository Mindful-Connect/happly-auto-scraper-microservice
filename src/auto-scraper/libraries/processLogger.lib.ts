import { Injectable, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExtractionProcessUpdateDto } from '@/auto-scraper/dtos/extractionProcessUpdate.dto';
import { OpportunityEventNamesEnum } from '@/auto-scraper/enums/opportunityEventNames.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HydratedDocument } from 'mongoose';

@Injectable({ scope: Scope.TRANSIENT })
export class ProcessLogger {
  private shouldLogInfo = true;
  constructor(private configService: ConfigService, private eventEmitter: EventEmitter2) {
    this.shouldLogInfo = this.configService.get<boolean>('NEST_DEBUG') ?? false;
  }

  private _document: HydratedDocument<any> | null = null;
  set document(value: HydratedDocument<any>) {
    this._document = value;
  }

  broadcast(payload: ExtractionProcessUpdateDto, ...otherArgs) {
    if (payload.detail) this.debug(payload.detail, ...otherArgs);

    this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionProcessUpdate, payload);
  }

  info(...message: any[]) {
    if (this._document !== null && this._document.logs) this._document.logs.push(message[0]);

    if (!this.shouldLogInfo) return;
    console.info(...message);
  }

  error(...message: any[]) {
    console.error(...message);
  }

  debug(...message: any[]) {
    console.debug(...message);
  }
}
