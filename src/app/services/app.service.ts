import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ExtractedOpportunity, ExtractedOpportunityDocument } from '../schemas/extractedOpportunity.schema';
import { Model } from 'mongoose';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ChatGPTService } from '../../openai/services/chatgpt.service';
import { getCheerioAPIFromHTML, isValidUrl, tryReassembleUrl } from '../utils/helperFunctions';
import { OpportunityStatusEnum } from '../enums/opportunityStatus.enum';
import { ExtractorService } from './extractor.service';
import { OpportunityEventNamesEnum } from '../enums/opportunityEventNames.enum';
import { ExtractionProcessUpdateDto } from '../dtos/response/extractionProcessUpdate.dto';
import { ProcessLogger } from './app.processLogger';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OpportunityPortalService } from '../../happly/services/opportunityPortal.service';
import { QueueItem } from '../dtos/request/submitURLs.request.dto';

interface ExtractingOpportunitiesQueueItem {
  url: string;
  extractingOpportunityDocument: ExtractedOpportunityDocument;
  isNested: boolean;
}

@Injectable()
export class AppService {
  private readonly extractingOpportunitiesQueue: ExtractingOpportunitiesQueueItem[] = [];

  private currentRunningExtractionProcesses = 0;

  private rateLimitTokenCounter = 0;
  private rateLimitTokenPerMinute = 40000;
  private rateLimitRequestPerMinute = 200;

  constructor(
    @InjectModel(ExtractedOpportunity.name)
    private extractedOpportunityModel: Model<ExtractedOpportunityDocument>,
    private chatGPTService: ChatGPTService,
    private eventEmitter: EventEmitter2,
    private extractorService: ExtractorService,
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

  @OnEvent(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease)
  async onOpportunityExtractionPoolRelease(extractedOpportunityDocument?: ExtractedOpportunityDocument) {
    this.currentRunningExtractionProcesses--;

    this.processLogger.info('Releasing the pool of processes for the next item in the queue... 🏊‍♂️🏊‍♂️🏊‍♂️');

    if (extractedOpportunityDocument) {
      if (extractedOpportunityDocument.errorDetails) {
        this.processLogger.broadcast(
          new ExtractionProcessUpdateDto(extractedOpportunityDocument.url)
            .finishedUnsuccessfully()
            .addDetail(extractedOpportunityDocument.errorDetails),
        );
      }

      // Send the update to the client webhook
      this.opportunityPortalService
        .updateQueuedOpportunity(extractedOpportunityDocument)
        .then(() => console.log('Successfully updated the opportunity portal with the extracted information! 🎉'))
        .catch(e => {
          console.error('Could not update the opportunity portal with the extracted information! ⚠️', e);
        });

      await extractedOpportunityDocument.save();
    }

    if (this.extractingOpportunitiesQueue.length > 0) {
      this.processLogger.info('There are still items in the queue. Extracting the next item... 🦾️🔥');
      const nextItem = this.extractingOpportunitiesQueue.shift();
      const syncId = Object.keys(nextItem)[0];
      const { url, extractingOpportunityDocument, isNested } = nextItem[syncId];
      await this.extractorService.extractOpportunity(url, extractingOpportunityDocument, isNested);
    } else {
      this.processLogger.info('There are no more items in the queue. yayi 🎉');
    }
  }

  @OnEvent(OpportunityEventNamesEnum.OpportunityExtractionRecurseNeeded)
  async onOpportunityExtractionRecurseNeeded(relevantLinks: { [p: string]: string[] }, extractedOpportunityDocument: ExtractedOpportunityDocument) {
    for (let link of Object.keys(relevantLinks)) {
      if (!isValidUrl(link)) {
        try {
          link = tryReassembleUrl(link, extractedOpportunityDocument.url);
        } catch (e) {
          continue;
        }
      }
      if (this.currentRunningExtractionProcesses >= 10) {
        this.processLogger.info('The pool of processes is full. Adding the item to the queue... 🚫🏊‍♂️🏊‍♂️🏊‍♂️');
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

      this.currentRunningExtractionProcesses++;
      await this.extractorService.extractOpportunity(link, extractedOpportunityDocument);
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
      await extractedOpportunityDocument.save();
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
      this.processLogger.info('Error while fetching the page. Marking it as NEEDS_REVIEW... 🚫', url);
      extractedOpportunityDocument.status = OpportunityStatusEnum.NEEDS_REVIEW;

      // the page is not accessible.So we need to review it manually
      extractedOpportunityDocument.errorDetails = 'Page is not accessible';
      this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, extractedOpportunityDocument);
      return;
    }

    // check if this is a CRP page
    // TODO: maybe ask chatGPT to confirm
    const clientRenderedPage = body.html().length < 200;

    extractedOpportunityDocument.clientRenderedPage = clientRenderedPage;
    await extractedOpportunityDocument.save();

    this.processLogger.info('Checking if this extraction process can be ran immediately... 🏃🔍', url);
    // if there are too many extraction processes running, put it in the queue
    if (this.currentRunningExtractionProcesses >= 10) {
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

    this.currentRunningExtractionProcesses++;
    await this.extractorService.extractOpportunity(url, extractedOpportunityDocument);
  }

  async getOpportunities(): Promise<ExtractedOpportunity[]> {
    return await this.extractedOpportunityModel.find().exec();
  }
}
