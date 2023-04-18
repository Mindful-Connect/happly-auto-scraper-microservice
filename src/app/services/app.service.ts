import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ExtractedOpportunity, ExtractedOpportunityDocument } from '../schemas/extractedOpportunity.schema';
import { Model } from 'mongoose';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ChatGPTService } from '@/openai/services/chatgpt.service';
import { getCheerioAPIFromHTML, isValidUrl, tryReassembleUrl } from '@/app/helpers/helperFunctions';
import { AutoScraperQueueStatusEnum } from '../enums/autoScraperQueueStatus.enum';
import { ExtractorService } from './extractor.service';
import { OpportunityEventNamesEnum } from '../enums/opportunityEventNames.enum';
import { ExtractionProcessUpdateDto } from '../dtos/response/extractionProcessUpdate.dto';
import { ProcessLogger } from './app.processLogger';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OpportunityPortalService } from '@/happly/services/opportunityPortal.service';
import { QueueItem } from '../dtos/request/submitURLs.request.dto';
import { ExtractingOpportunitiesQueueItem } from '@/app/models/ExtractingOpportunitiesQueueItem.model';
import { saveSafely } from '@/app/helpers/mongooseHelpers';

@Injectable()
export class AppService {
  private readonly extractingOpportunitiesQueue: ExtractingOpportunitiesQueueItem[] = [];
  private readonly currentRunningExtractionProcesses: Record<string, ExtractorService> = {};

  private rateLimitTokenCounter = 0;
  private rateLimitTokenPerMinute = 40000;
  private rateLimitRequestPerMinute = 200;

  constructor(
    @InjectModel(ExtractedOpportunity.name)
    private extractedOpportunityModel: Model<ExtractedOpportunityDocument>,
    private chatGPTService: ChatGPTService,
    private eventEmitter: EventEmitter2,
    private processLogger: ProcessLogger,
    private opportunityPortalService: OpportunityPortalService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleCron() {
    const newQueuedOpportunities = await this.opportunityPortalService.getQueuedOpportunities();

    if (newQueuedOpportunities.length > 0) {
      this.processLogger.info(`Found ${newQueuedOpportunities.length} new queued opportunities!`);
      newQueuedOpportunities.forEach(queueItem => {
        this.submitQueueItem(queueItem)
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

    // wait a bit to make sure async processes are done
    await new Promise(resolve => setTimeout(resolve, 5000));

    const anyRelatedProcessQueued = this.extractingOpportunitiesQueue.some(
      p => p.extractingOpportunityDocument.queueId === extractedOpportunityDocument.queueId,
    );
    if (anyRelatedProcessQueued) return;

    const anyRelatedProcessRunning = Object.keys(this.currentRunningExtractionProcesses).some(
      p =>
        this.currentRunningExtractionProcesses[p].extractedOpportunityDocument.queueId === extractedOpportunityDocument.queueId &&
        this.currentRunningExtractionProcesses[p].extractedOpportunityDocument.url !== extractedOpportunityDocument.url, // Only if the url is different (related URLs)
    );
    if (anyRelatedProcessRunning) return;

    this.processLogger.broadcast(
      new ExtractionProcessUpdateDto(extractedOpportunityDocument.url)
        .finishedSuccessfully()
        .addDetail('Submitting data to the portal... 🚀 - Ready to be reviewed!'),
    );
    await this.opportunityPortalService.submitNewScrapedOpportunity(extractedOpportunityDocument);
  }

  @OnEvent(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease)
  async onOpportunityExtractionPoolRelease(extractedOpportunityDocument?: ExtractedOpportunityDocument, processLogger?: ProcessLogger) {
    processLogger = processLogger || this.processLogger;
    processLogger.info('Releasing the pool of processes for the next item in the queue... 🏊‍♂️🏊‍♂️🏊‍♂️');

    if (extractedOpportunityDocument) {
      delete this.currentRunningExtractionProcesses[extractedOpportunityDocument.queueId];
      processLogger.info(
        'Removed the process from the current running processes list! 🗑️',
        'queueId',
        extractedOpportunityDocument.queueId,
        this.currentRunningExtractionProcesses,
      );

      if (extractedOpportunityDocument.errorDetails) {
        processLogger.broadcast(
          new ExtractionProcessUpdateDto(extractedOpportunityDocument.url)
            .finishedUnsuccessfully()
            .addDetail(extractedOpportunityDocument.errorDetails),
        );
        extractedOpportunityDocument.errorDetails = undefined;
      } else {
      }

      // Send the update to the client webhook
      this.opportunityPortalService
        .updateQueuedOpportunity(extractedOpportunityDocument)
        .then(() => console.log('Successfully updated the opportunity portal with the extracted information! 🎉'))
        .catch(e => {
          console.error('Could not update the opportunity portal with the extracted information! ⚠️', e);
        });

      await saveSafely(extractedOpportunityDocument);
    }

    if (this.extractingOpportunitiesQueue.length > 0) {
      processLogger.info('There are still items in the queue. Extracting the next item... 🦾️🔥', this.extractingOpportunitiesQueue);
      const nextItem = this.extractingOpportunitiesQueue.shift();

      const { extractingOpportunityDocument } = nextItem;

      const extractorService = new ExtractorService(this.chatGPTService, this.eventEmitter, processLogger, nextItem);
      this.currentRunningExtractionProcesses[extractingOpportunityDocument.queueId] = extractorService;
      extractorService
        .extractOpportunity()
        .catch(() =>
          this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, extractingOpportunityDocument, processLogger),
        );
    } else {
      processLogger.info('There are no more items in the queue. yayi 🎉');
    }
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
      if (Object.keys(this.currentRunningExtractionProcesses).length >= 10) {
        this.processLogger.info(
          'The pool of processes is full. Adding the item to the queue... 🚫🏊‍♂️🏊‍♂️🏊‍♂️',
          this.currentRunningExtractionProcesses,
          this.extractingOpportunitiesQueue,
        );
        this.processLogger.broadcast(new ExtractionProcessUpdateDto(extractedOpportunityDocument.url).queued());
        this.extractingOpportunitiesQueue.push({
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
      );
      this.processLogger.info('Running extraction process for relevant URL immediately... 🏃🏃☑️', link, extractedOpportunityDocument);

      const extractorService = new ExtractorService(this.chatGPTService, this.eventEmitter, this.processLogger, {
        url: link,
        extractingOpportunityDocument: extractedOpportunityDocument,
        isNested: true,
      });
      this.currentRunningExtractionProcesses[extractedOpportunityDocument.queueId] = extractorService;
      extractorService
        .extractOpportunity()
        .catch(() =>
          this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, extractedOpportunityDocument, this.processLogger),
        );
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

  async submitQueueItem(queueItem: QueueItem): Promise<any> {
    const { url, name, queueId } = queueItem;
    // imagining all the webpages are not using javascript to render. (TODO: fix puppeteer)

    let extractedOpportunityDocument = await this.extractedOpportunityModel.findOne({ url }).exec();
    if (extractedOpportunityDocument === null) {
      this.processLogger.info('No entry found for this URL. Creating a new one... 🆕✨', url);
      extractedOpportunityDocument = new this.extractedOpportunityModel(
        new ExtractedOpportunity({
          url,
          name,
          queueId,
          clientRenderedPage: false,
        }),
      );

      await saveSafely(extractedOpportunityDocument);
    } else {
      // TODO: remove this (this is for the demo)
      this.processLogger.info('Entry found for this URL. Updating the status... 🔄', url);
    }
    this.processLogger.broadcast(new ExtractionProcessUpdateDto(url, 10));

    let $: cheerio.CheerioAPI;
    let body: cheerio.Cheerio<cheerio.Element>;

    try {
      const pageHTML = await axios.get(url);

      $ = getCheerioAPIFromHTML(pageHTML.data);
      body = $('body');
      this.processLogger.broadcast(new ExtractionProcessUpdateDto(url, 5));
    } catch (e) {
      this.processLogger.info('Error while fetching the page. Marking it as FAILED_TO_PROCESS... 🚫', url);
      extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.FAILED_TO_PROCESS;

      // the page is not accessible.So we need to review it manually
      extractedOpportunityDocument.errorDetails = 'Page is not accessible';
      this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, extractedOpportunityDocument);

      setTimeout(() => {
        extractedOpportunityDocument.deleteOne();
      }, 5000);
      return;
    }

    // check if this is a CRP page
    // TODO: maybe ask chatGPT to confirm
    const clientRenderedPage = body.html().length < 200;

    extractedOpportunityDocument.clientRenderedPage = clientRenderedPage;
    await saveSafely(extractedOpportunityDocument);

    this.processLogger.info('Checking if this extraction process can be ran immediately... 🏃🔍', url);
    // if there are too many extraction processes running, put it in the queue
    if (Object.keys(this.currentRunningExtractionProcesses).length >= 10) {
      this.processLogger.debug(this.currentRunningExtractionProcesses);
      this.processLogger.broadcast(
        new ExtractionProcessUpdateDto(url).queued().addDetail('Too many extraction processes running. Putting it in the queue... 📝'),
      );
      this.extractingOpportunitiesQueue.push({
        url,
        extractingOpportunityDocument: extractedOpportunityDocument,
        isNested: false,
      });
      return;
    }

    this.processLogger.broadcast(new ExtractionProcessUpdateDto(url, 20).addDetail('Running extraction process immediately... 🏃☑️'));

    const extractorService = new ExtractorService(this.chatGPTService, this.eventEmitter, this.processLogger, {
      url,
      extractingOpportunityDocument: extractedOpportunityDocument,
      isNested: false,
    });
    this.currentRunningExtractionProcesses[extractedOpportunityDocument.queueId] = extractorService;
    extractorService.extractOpportunity().catch(() => {
      this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, extractedOpportunityDocument, this.processLogger);
    });
  }

  async getOpportunities(): Promise<ExtractedOpportunity[]> {
    return await this.extractedOpportunityModel.find().exec();
  }
}
