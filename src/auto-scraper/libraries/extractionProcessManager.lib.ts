import { Injectable } from '@nestjs/common';
import { ExtractingOpportunitiesQueueItem } from '@/auto-scraper/models/ExtractingOpportunitiesQueueItem.model';
import { ExtractorService } from '@/auto-scraper/services/extractor.service';
import * as crypto from 'crypto';

@Injectable()
export class ExtractionProcessManager {
  public queue: ExtractingOpportunitiesQueueItem[] = [];
  public readonly currentRunningProcesses: Record<string, ExtractorService> = {};

  @logger
  async addProcessToPool(url: string, extractorService: ExtractorService) {
    const hashedUrl = this.getHashedUrl(url);
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
