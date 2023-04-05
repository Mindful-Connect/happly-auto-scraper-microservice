import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ExtractedOpportunity, ExtractedOpportunityDocument } from './schemas/extractedOpportunity.schema';
import { Model } from 'mongoose';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ChatGPTService } from './openai/services/chatgpt.service';
import { getCheerioAPIFromHTML, isValidUrl, tryReassembleUrl } from './utils/helperFunctions';
import { OpportunityStatusEnum } from './enums/opportunityStatus.enum';
import { ExtractorService } from './extractor.service';
import { OpportunityEventNamesEnum } from './enums/opportunityEventNames.enum';
import { ExtractionProcessUpdateDto } from './dtos/response/extractionProcessUpdate.dto';

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
  ) {}

  @OnEvent(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease)
  async onOpportunityExtractionPoolRelease(extractedOpportunityDocument?: ExtractedOpportunityDocument) {
    this.currentRunningExtractionProcesses--;

    console.info('Releasing the pool of processes for the next item in the queue... 🏊‍♂️🏊‍♂️🏊‍♂️');

    if (this.extractingOpportunitiesQueue.length > 0) {
      console.info('There are still items in the queue. Extracting the next item... 🦾️🔥');
      const nextItem = this.extractingOpportunitiesQueue.shift();
      const syncId = Object.keys(nextItem)[0];
      const { url, extractingOpportunityDocument, isNested } = nextItem[syncId];
      await this.extractorService.extractOpportunity(url, extractingOpportunityDocument, isNested);
    } else {
      console.info('There are no more items in the queue. yayi 🎉');
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
        console.info('The pool of processes is full. Adding the item to the queue... 🚫🏊‍♂️🏊‍♂️🏊‍♂️');
        this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionProcessUpdate, new ExtractionProcessUpdateDto(extractedOpportunityDocument.url).queued());
        this.extractingOpportunitiesQueue.push({
          url: link,
          extractingOpportunityDocument: extractedOpportunityDocument,
          isNested: true,
        });
        continue;
      }

      this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionProcessUpdate, new ExtractionProcessUpdateDto(extractedOpportunityDocument.url).unqueued());
      console.info('Running extraction process for relevant URL immediately... 🏃🏃☑️', link, extractedOpportunityDocument);
      this.currentRunningExtractionProcesses++;
      await this.extractorService.extractOpportunity(link, extractedOpportunityDocument);
    }
  }

  async submitURL(url: string): Promise<any> {
    // imagining all the webpages are not using javascript to render. (TODO: fix puppeteer)

    let extractedOpportunityDocument = await this.extractedOpportunityModel.findOne({ url }).exec();
    if (extractedOpportunityDocument === null) {
      console.info('No entry found for this URL. Creating a new one... 🆕✨', url);
      extractedOpportunityDocument = new this.extractedOpportunityModel(
        new ExtractedOpportunity({
          url,
          clientRenderedPage: false,
        }),
      );
      await extractedOpportunityDocument.save();
    } else {
      // TODO: remove this (this is for the demo)
      console.info('Entry found for this URL. Updating the status... 🔄', url);
    }
    this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionProcessUpdate, new ExtractionProcessUpdateDto(url, 10));

    let $: cheerio.CheerioAPI;
    let body: cheerio.Cheerio<cheerio.Element>;

    try {
      const pageHTML = await axios.get(url);

      $ = getCheerioAPIFromHTML(pageHTML.data);
      body = $('body');
      this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionProcessUpdate, new ExtractionProcessUpdateDto(url, 5));
    } catch (e) {
      console.info('Error while fetching the page. Marking it as NEEDS_REVIEW... 🚫', url);
      extractedOpportunityDocument.status = OpportunityStatusEnum.NEEDS_REVIEW;

      // the page is not accessible.So we need to review it manually
      this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionProcessUpdate, new ExtractionProcessUpdateDto(url).finishedUnsuccessfully());
      return;
    }

    // check if this is a CRP page
    // TODO: maybe ask chatGPT to confirm
    const clientRenderedPage = body.html().length < 200;

    extractedOpportunityDocument.clientRenderedPage = clientRenderedPage;
    await extractedOpportunityDocument.save();

    console.info('Checking if this extraction process can be ran immediately... 🏃🔍', url);
    // if there are too many extraction processes running, put it in the queue
    if (this.currentRunningExtractionProcesses >= 10) {
      console.info('Too many extraction processes running. Putting it in the queue... 📝', url);
      this.extractingOpportunitiesQueue.push({
        url,
        extractingOpportunityDocument: extractedOpportunityDocument,
        isNested: false,
      });
      this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionProcessUpdate, new ExtractionProcessUpdateDto(url).queued());
      return;
    }

    console.info('Running extraction process immediately... 🏃☑️', url);
    this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionProcessUpdate, new ExtractionProcessUpdateDto(url, 20));

    this.currentRunningExtractionProcesses++;
    await this.extractorService.extractOpportunity(url, extractedOpportunityDocument);
  }

  async getOpportunities(): Promise<ExtractedOpportunity[]> {
    return await this.extractedOpportunityModel.find().exec();
  }
}
