import { Injectable } from '@nestjs/common';
import { ExtractedOpportunity, ExtractedOpportunityDocument } from '@/extracted-opportunity/schemas/extractedOpportunity.schema';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ChatGPTService } from '@/openai/services/chatgpt.service';
import { getCheerioAPIFromHTML, getMySQLDateFormatUTC, isValidUrl, tryReassembleUrl } from '@/_domain/helpers/helperFunctions';
import { AutoScraperQueueStatusEnum } from '@/auto-scraper/enums/autoScraperQueueStatus.enum';
import { ExtractorService } from './extractor.service';
import { OpportunityEventNamesEnum } from '@/auto-scraper/enums/opportunityEventNames.enum';
import { ExtractionProcessUpdateDto } from '@/auto-scraper/dtos/extractionProcessUpdate.dto';
import { ProcessLogger } from '../libraries/processLogger.lib';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OpportunityPortalService } from '@/happly/services/opportunityPortal.service';
import { QueueItem } from '@/auto-scraper/dtos/request/submitURLs.request.dto';
import { saveSafely } from '@/_domain/helpers/mongooseHelpers';
import { QueueItemSourceEnum } from '@/happly/enums/queueItemSource.enum';
import { ExtractedOpportunityRepository } from '@/extracted-opportunity/repositories/extractedOpportunity.repository';
import * as https from 'https';
import * as crypto from 'crypto';
import { ExtractionProcessManager } from '@/auto-scraper/libraries/extractionProcessManager.lib';
import { ModuleRef } from '@nestjs/core';

@Injectable()
export class AutoScraperService {
  constructor(
    private moduleRef: ModuleRef,
    private readonly extractionProcessManager: ExtractionProcessManager,
    private readonly extractedOpportunityRepository: ExtractedOpportunityRepository,
    private chatGPTService: ChatGPTService,
    private eventEmitter: EventEmitter2,
    private processLogger: ProcessLogger,
    private opportunityPortalService: OpportunityPortalService,
  ) {}

  async submitQueueItem(queueItem: QueueItem): Promise<any> {
    const { url, name, queueId, source } = queueItem;
    let extractedOpportunityDocument = await this.extractedOpportunityRepository.findByURL(url);
    if (extractedOpportunityDocument === null) {
      console.info('No entry found for this URL. Creating a new one... 🆕✨', url);
      extractedOpportunityDocument = await this.extractedOpportunityRepository.create(
        new ExtractedOpportunity({
          url,
          name,
          queueId,
          source,
          clientRenderedPage: false,
        }),
      );
    } else {
      console.info('Entry found for this URL. Updating the status... 🔄', url);
    }

    this.processLogger.broadcast(new ExtractionProcessUpdateDto(url, 5));

    let $: cheerio.CheerioAPI;

    try {
      const pageHTML = await axios.get(url, {
        httpsAgent: new https.Agent({
          // for self signed you could also add
          // rejectUnauthorized: false,

          // allow legacy server
          secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
        }),
      });

      $ = getCheerioAPIFromHTML(pageHTML.data);
      this.processLogger.broadcast(new ExtractionProcessUpdateDto(url, 5));
    } catch (e) {
      console.error('Error while fetching the page. Marking it as FAILED_TO_PROCESS... 🚫', url);
      extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.FAILED_TO_PROCESS;

      // the page is not accessible.So we need to review it manually
      extractedOpportunityDocument.errorDetails = 'Page is not accessible';

      this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, extractedOpportunityDocument);
      return;
    }

    // check if this is a CRP page
    extractedOpportunityDocument.clientRenderedPage = $('p').length < 2;
    await saveSafely(extractedOpportunityDocument);

    // if there are too many extraction processes running, put it in the queue
    if (!this.extractionProcessManager.hasSpaceInRunningProcesses()) {
      this.processLogger.broadcast(
        new ExtractionProcessUpdateDto(url).queued().addDetail('Too many extraction processes running. Putting it in the queue... 📝'),
      );
      this.extractionProcessManager.queue.push({
        url,
        extractingOpportunityDocument: extractedOpportunityDocument,
        isNested: false,
      });
      return;
    }

    this.processLogger.broadcast(new ExtractionProcessUpdateDto(url, 20).addDetail('Running extraction process immediately... 🏃☑️'));

    const extractorService = await this.moduleRef.resolve(ExtractorService);
    extractorService.setExtractingOpportunityQueueItem({
      url,
      extractingOpportunityDocument: extractedOpportunityDocument,
      isNested: false,
    });
    await this.extractionProcessManager.addProcessToPool(extractedOpportunityDocument.url, extractorService);
    extractorService.extractOpportunity().catch(e => {
      console.error('Could not extract the opportunity! ⚠️', e);
      this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, extractedOpportunityDocument, this.processLogger);
    });
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleCron() {
    // return; // TODO: remove this line to enable cron
    const newQueuedOpportunities = await this.opportunityPortalService.getQueuedOpportunities();

    if (newQueuedOpportunities.length > 0) {
      this.processLogger.info(`Found ${newQueuedOpportunities.length} new queued opportunities!`);
      newQueuedOpportunities.forEach(queueItem => {
        this.submitQueueItem({
          url: queueItem.url,
          name: queueItem.name,
          queueId: queueItem.queue_id,
          source: queueItem.source,
        })
          .then()
          .catch(e => {
            console.error(e);
          });
      });
    }
  }

  @OnEvent(OpportunityEventNamesEnum.ExtractionCompleted)
  async onExtractionCompleted(extractedOpportunityDocument?: ExtractedOpportunityDocument) {
    if (!extractedOpportunityDocument)
      return this.processLogger.error('No extractedOpportunityDocument was provided!', 'extractedOpportunityDocument', extractedOpportunityDocument);

    // Don't automatically submit to the panel if the source is from the existing expired opportunities
    // Or if the extracted opportunity was already submitted once
    if (extractedOpportunityDocument.source === QueueItemSourceEnum.ExpiredOpportunity || extractedOpportunityDocument.submittedAt) return;

    // wait a bit to make sure async processes are done
    await new Promise(resolve => setTimeout(resolve, 5000));

    const anyRelatedProcessQueued = this.extractionProcessManager.queue.some(
      p => p.extractingOpportunityDocument.queueId === extractedOpportunityDocument.queueId,
    );
    if (anyRelatedProcessQueued) return;

    const currentRunningExtractionProcesses = this.extractionProcessManager.currentRunningProcesses;
    const anyRelatedProcessRunning = Object.keys(currentRunningExtractionProcesses).some(
      p =>
        currentRunningExtractionProcesses[p].extractedOpportunityDocument.queueId === extractedOpportunityDocument.queueId &&
        currentRunningExtractionProcesses[p].url !== extractedOpportunityDocument.url, // Only if the url is different (related URLs)
    );
    if (anyRelatedProcessRunning) return;

    this.processLogger.broadcast(
      new ExtractionProcessUpdateDto(extractedOpportunityDocument.url)
        .finishedSuccessfully()
        .addDetail('Submitting data to the portal... 🚀 - Ready to be reviewed!'),
    );
    await this.opportunityPortalService.submitNewScrapedOpportunity(extractedOpportunityDocument);
    extractedOpportunityDocument.submittedAt = getMySQLDateFormatUTC();
  }

  @OnEvent(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease)
  async onOpportunityExtractionPoolRelease(extractedOpportunityDocument?: ExtractedOpportunityDocument, processLogger?: ProcessLogger) {
    processLogger = processLogger || this.processLogger;
    processLogger.info('Releasing the pool of processes for the next item in the queue... 🏊‍♂️🏊‍♂️🏊‍♂️');

    if (extractedOpportunityDocument) {
      await this.extractionProcessManager.removeProcessFromPool(extractedOpportunityDocument.url);
      processLogger.info('Removed the process from the current running processes list! 🗑️', 'url', extractedOpportunityDocument.url);

      if (extractedOpportunityDocument.errorDetails) {
        processLogger.broadcast(
          new ExtractionProcessUpdateDto(extractedOpportunityDocument.url)
            .finishedUnsuccessfully()
            .addDetail(extractedOpportunityDocument.errorDetails),
        );
        extractedOpportunityDocument.errorDetails = undefined;
        await saveSafely(extractedOpportunityDocument);
      }

      // Send the update to the client webhook
      this.opportunityPortalService
        .updateQueuedOpportunity(extractedOpportunityDocument)
        .then(() => console.log('Successfully updated the opportunity portal with the extracted information! 🎉'))
        .catch(e => {
          console.error('Could not update the opportunity portal with the extracted information! ⚠️', e);
        });
    }

    await this.extractionProcessManager.next(processLogger);
  }

  @OnEvent(OpportunityEventNamesEnum.OpportunityExtractionRecurseNeeded)
  async onOpportunityExtractionRecurseNeeded(relevantLinks: { [p: string]: string[] }, extractedOpportunityDocument: ExtractedOpportunityDocument) {
    let anyRelevantLinkFound = false;
    for (let link of Object.keys(relevantLinks)) {
      this.processLogger.info(`Found a relevant link: ${link} 🧐`);
      if (!isValidUrl(link)) {
        try {
          this.processLogger.info(`The link is not a valid URL. Trying to reassemble it... 🧐 ${link} - ${extractedOpportunityDocument.url}`);
          link = tryReassembleUrl(extractedOpportunityDocument.url, link);
        } catch (e) {
          this.processLogger.error(`Could not reassemble the URL. Skipping... ❌🧐 ${link} - ${extractedOpportunityDocument.url}`);
          continue;
        }
      }
      anyRelevantLinkFound = true;
      if (!this.extractionProcessManager.hasSpaceInRunningProcesses()) {
        this.processLogger.broadcast(
          new ExtractionProcessUpdateDto(extractedOpportunityDocument.url).queued(),
          'The pool of processes is full. Adding the item to the queue... 🚫🏊‍♂️🏊‍♂️🏊‍♂️',
        );
        this.extractionProcessManager.queue.push({
          url: link,
          extractingOpportunityDocument: extractedOpportunityDocument,
          isNested: true,
        });
        continue;
      }

      this.processLogger.broadcast(
        new ExtractionProcessUpdateDto(extractedOpportunityDocument.url)
          .unqueued()
          .addDetail('Running extraction process for relevant URL immediately... 🏃🏃☑️'),
        link,
        extractedOpportunityDocument,
      );

      const extractorService = await this.moduleRef.resolve(ExtractorService);
      extractorService.setExtractingOpportunityQueueItem({
        url: link,
        extractingOpportunityDocument: extractedOpportunityDocument,
        isNested: true,
      });
      await this.extractionProcessManager.addProcessToPool(extractedOpportunityDocument.url, extractorService);
      extractorService.extractOpportunity().catch(e => {
        console.error('Could not extract the nested opportunity! ⚠️', e);
        this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, extractedOpportunityDocument, this.processLogger);
      });
    }

    if (!anyRelevantLinkFound) {
      this.processLogger.broadcast(
        new ExtractionProcessUpdateDto(extractedOpportunityDocument.url)
          .finishedSuccessfully()
          .addDetail('Relevant links found in the page are all broken 🥲🚫'),
      );
      this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionCompleted, extractedOpportunityDocument);
    }
  }

  @OnEvent(OpportunityEventNamesEnum.OpportunityDeleted)
  async onOpportunityDeleted(queueId: string) {
    // Remove all the queued items relate to this queueId
    this.extractionProcessManager.queue = this.extractionProcessManager.queue.filter(i => i.extractingOpportunityDocument.queueId !== queueId);

    Object.values(this.extractionProcessManager.currentRunningProcesses).forEach(c => {
      if (c.extractedOpportunityDocument.queueId === queueId) {
        this.extractionProcessManager.removeProcessFromPool(c.url, true);
      }
    });

    const deleteResult = await this.extractedOpportunityRepository
      .deleteByQueueId(queueId)
      .catch(e => console.error('Deleting Opportunity errored!', e));
    if (deleteResult) console.info('Extracted Opportunity record Deletion. 🗑️ `deletedCount`: ', deleteResult.deletedCount);
  }
}
