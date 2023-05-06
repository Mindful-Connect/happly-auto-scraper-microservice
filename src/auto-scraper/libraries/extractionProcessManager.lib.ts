import { Injectable } from '@nestjs/common';
import { ExtractingOpportunitiesQueueItem } from '@/auto-scraper/models/extractingOpportunitiesQueueItem.model';
import { ExtractorService } from '@/auto-scraper/services/extractor.service';
import * as crypto from 'crypto';
import { ProcessLogger } from '@/auto-scraper/libraries/processLogger.lib';
import { ModuleRef } from '@nestjs/core';
import { OpportunityEventNamesEnum } from '@/auto-scraper/enums/opportunityEventNames.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ExtractionProcessManager {
  public queue: ExtractingOpportunitiesQueueItem[] = [];
  public readonly currentRunningProcesses: Record<string, ExtractorService> = {};

  public constructor(private readonly processLogger: ProcessLogger, private moduleRef: ModuleRef, private readonly eventEmitter: EventEmitter2) {}

  @logger
  async addProcessToPool(url: string, extractorService: ExtractorService) {
    const hashedUrl = this.getHashedUrl(url);
    if (this.currentRunningProcesses[hashedUrl]) {
      console.debug(`Process already exists for url ${url} in currentRunningExtractionProcesses`);
      return false;
    }
    this.currentRunningProcesses[hashedUrl] = extractorService;
    return true;
  }

  @logger
  async removeProcessFromPool(url: string, abort = false) {
    const hashedUrl = this.getHashedUrl(url);
    const process = this.currentRunningProcesses[hashedUrl];
    if (!process) {
      console.debug(`No process found for url ${url} in currentRunningExtractionProcesses`);
      return false;
    }

    if (abort) {
      await this.currentRunningProcesses[hashedUrl].gptAbortController.abort();
    }
    delete this.currentRunningProcesses[hashedUrl];
    return true;
  }

  @logger
  async next(processLogger: ProcessLogger = this.processLogger) {
    if (this.queue.length > 0) {
      processLogger.info('There are still items in the queue. Extracting the next item... 🦾️🔥', this.queue);
      const nextItem = this.queue.shift();

      const { extractingOpportunityDocument } = nextItem;

      const extractorService = await this.moduleRef.resolve(ExtractorService);
      extractorService.setExtractingOpportunityQueueItem(nextItem);
      const processAdded = await this.addProcessToPool(extractingOpportunityDocument.url, extractorService);
      if (processAdded) {
        extractorService
          .extractOpportunity()
          .catch(() =>
            this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, extractingOpportunityDocument, processLogger),
          );
      }
    } else {
      processLogger.info('There are no more items in the queue. yayi 🎉');
    }
  }

  @logger
  hasSpaceInRunningProcesses() {
    return Object.keys(this.currentRunningProcesses).length <= 10;
  }

  private getHashedUrl(url: string) {
    const shaSum = crypto.createHash('sha1');
    return shaSum.update(url).digest('hex').slice(0, 6);
  }
}

function logger(target: ExtractionProcessManager, propertyKey: string, descriptor: PropertyDescriptor) {
  const original = descriptor.value;

  descriptor.value = function (...args: any[]) {
    console.info(`Calling ${propertyKey} with`, args);
    const result = original.call(this, ...args);
    console.info(`Result from ${propertyKey} is`, result);
    console.info('currentRunningExtractionProcesses', target.currentRunningProcesses, '\n', 'extractingOpportunitiesQueue', target.queue);
    return result;
  };
}
