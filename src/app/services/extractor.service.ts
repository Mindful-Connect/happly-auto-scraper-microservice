import { ExtractedOpportunityDocument, InterestingFields } from '../schemas/extractedOpportunity.schema';
import * as cheerio from 'cheerio';
import axios from 'axios';
import puppeteer from 'puppeteer';
import { minify } from 'html-minifier-terser';
import { encode } from 'gpt-3-encoder';
import { ChatGPTService } from '@/openai/services/chatgpt.service';
import { Field, FieldPossibleTypes } from '../schemas/field.schema';
import { GPTFinishReason } from '@/openai/openai.types';
import { AutoScraperQueueStatusEnum } from '../enums/autoScraperQueueStatus.enum';
import { getCheerioAPIFromHTML, isValidUri } from '../utils/helperFunctions';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OpportunityEventNamesEnum } from '../enums/opportunityEventNames.enum';
import { ExtractionProcessUpdateDto } from '../dtos/response/extractionProcessUpdate.dto';
import { ProcessLogger } from './app.processLogger';
import { ExtractingOpportunitiesQueueItem } from '@/app/models/ExtractingOpportunitiesQueueItem.model';
import { saveSafely } from '@/app/utils/mongooseHelpers';

export class ExtractorService {
  public url: string;
  public extractedOpportunityDocument: ExtractedOpportunityDocument;
  public isNested: boolean;

  private systemMessage =
    'Given a chunk of HTML text, extract information asked by the user, and reply only in JSON format. your replies must be fully parsable by JSON.parse method in JavaScript.';

  private segmentSplittingIdentifiers: string[] = ['<h1', '<h2', '<h3', '<p', '.'];

  constructor(
    private chatGPTService: ChatGPTService,
    private eventEmitter: EventEmitter2,
    public processLogger: ProcessLogger,
    extractingOpportunitiesQueueItem: ExtractingOpportunitiesQueueItem,
  ) {
    this.url = extractingOpportunitiesQueueItem.url;
    this.extractedOpportunityDocument = extractingOpportunitiesQueueItem.extractingOpportunityDocument;
    this.isNested = extractingOpportunitiesQueueItem.isNested;
  }

  async extractOpportunity() {
    // Assigning the `this.extractedOpportunityDocument` to a variable to make it easier to access
    const extractedOpportunityDocument = this.extractedOpportunityDocument;

    this.processLogger.extractedOpportunityDocument = extractedOpportunityDocument;

    let $: cheerio.CheerioAPI;
    if (this.extractedOpportunityDocument.clientRenderedPage) {
      this.processLogger.info('Client rendered page detected, using puppeteer... 📦🪄');
      const browser = await puppeteer.launch();
      const page = await browser.newPage();

      await page.goto(this.url);

      const pageHTML = await page.content();
      $ = getCheerioAPIFromHTML(pageHTML);
    } else {
      this.processLogger.info('Static page detected, standard fetching... 🚛💨');
      const pageHTML = await axios.get(this.url);

      $ = getCheerioAPIFromHTML(pageHTML.data);
    }
    this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 5));

    let stripped: string;
    try {
      stripped = await this.getStrippedBodyHTML($);
      this.processLogger.info('Stripped the HTML body... 🫣 to make it shorter for ChatGPT ✨', { stripped });
      this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 10).addDetail('Stripped the HTML body... 🫣'));
    } catch (e) {
      console.error('Could not strip the HTML body... 🫣', e);
      this.extractedOpportunityDocument.errorDetails = 'Could not strip the HTML body... 🫣';
      this.extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.FAILED_TO_PROCESS;
      this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, this.extractedOpportunityDocument, this.processLogger);
      return;
    }

    const chunks = this.segmentTheChunk(stripped);
    const flattened = chunks.flat(<20>Infinity).filter(c => c !== '') as string[];
    this.processLogger.info('Segmented the HTML chunk into smaller chunks if necessary... 🪄🗃️', {
      flattened,
    });
    this.processLogger.broadcast(
      new ExtractionProcessUpdateDto(this.url, 3).addDetail('Segmented the HTML chunk into smaller chunks if necessary... 🪄🗃️'),
    );

    while (flattened.length > 0) {
      const readyToBeSent: string[] = [];

      this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 1));

      while (
        flattened.length > 0 &&
        ChatGPTService.tokenLimit / 2 >= this.countTokens([this.systemMessage, this.getUserMessage(readyToBeSent.join('') + flattened[0])])
      ) {
        this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 2).addDetail('Gathering chunks to be sent to ChatGPT... 🚚'));
        readyToBeSent.push(flattened.shift());
      }

      this.processLogger.info('Gathering chunks to be sent to ChatGPT... 🚚', { readyToBeSent });

      const userMessage = this.getUserMessage(readyToBeSent.join(''));

      const totalMessagesToken = this.countTokens([this.systemMessage, userMessage]);

      const requestingFields = this.getRequestingFields();
      this.processLogger.info('Deciding which missing fields to request... 🔍📦', { requestingFields });
      this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 5));

      if (requestingFields.length === 0) {
        this.processLogger.info('No more missing fields to request... 📦📦📦');
        this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, this.extractedOpportunityDocument, this.processLogger);
        this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url).finishedSuccessfully());
        return;
      }

      try {
        this.processLogger.broadcast(
          new ExtractionProcessUpdateDto(this.url, 10).addDetail('Sending request to ChatGPT... 🧠🤖 This might take a few seconds ⏳'),
        );
        console.warn('Sending request to ChatGPT... 🧠🤖 This might take a few seconds ⏳');
        const gptResponse = await this.chatGPTService.getResponse({
          model: 'gpt-4-0314',
          messages: [
            {
              role: 'system',
              content: this.systemMessage,
            },
            {
              role: 'user',
              content: userMessage,
            },
          ],
          temperature: 0.65,
          max_tokens: ChatGPTService.tokenLimit - totalMessagesToken, // completion token.
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
          n: 1,
          stream: false,
        });

        // this.rateLimitTokenCounter += gptResponse.usage.total_tokens;

        this.processLogger.info('Received response from ChatGPT... ✅🧠🤖', gptResponse);

        const finishReason: GPTFinishReason = gptResponse.choices[0].finish_reason;
        if (finishReason !== GPTFinishReason.STOP) {
          this.processLogger.info('ChatGPT did not finish the response... ❌🧠🤖', gptResponse);

          this.extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.GPT_ERROR;
          this.extractedOpportunityDocument.errorDetails = 'ChatGPT did not finish the response... ❌🧠🤖';
          this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, this.extractedOpportunityDocument, this.processLogger);
          return;
        }

        const responseStringJson = gptResponse.choices[0].message.content;
        const response = JSON.parse(responseStringJson);

        Object.keys(response).forEach(key => {
          const value: { data: any; relevant_link: string } = response[key];
          if (requestingFields.includes(key)) {
            this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 1));
            this.extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.PARTIALLY_EXTRACTED;

            const field = this.extractedOpportunityDocument[key] as Field<FieldPossibleTypes>;
            field.data = value.data;
            field.relevantLink = isValidUri(value.relevant_link) ? value.relevant_link : field.relevantLink;
          }
        });

        // save in db
        await saveSafely(extractedOpportunityDocument);
        this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 5).addDetail('Saved the response in the database... ✅📦🗃️'));
        this.processLogger.info('Saved the response in the database... ✅📦🗃️');
      } catch (e) {
        this.processLogger.info('ChatGPT failed to respond... ❌🧠🤖', e);

        this.extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.GPT_ERROR;
        this.extractedOpportunityDocument.errorDetails = 'ChatGPT failed to respond... ❌🧠🤖';
        this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, this.extractedOpportunityDocument, this.processLogger);
        console.error(e, e.response, e.response.data);
      }
    }

    const anyOtherRequestingFields = this.getRequestingFields();

    if (!this.isNested) {
      const relevantLinks: { [key in string]: string[] } = {};
      anyOtherRequestingFields.forEach(fieldName => {
        const field = this.extractedOpportunityDocument[fieldName] as Field<FieldPossibleTypes>;
        if (isValidUri(field.relevantLink)) {
          if (relevantLinks[field.relevantLink]) {
            relevantLinks[field.relevantLink].push(fieldName);
          } else {
            relevantLinks[field.relevantLink] = [fieldName];
          }
        }
      });

      if (anyOtherRequestingFields.length === 0) {
        extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.FULLY_EXTRACTED;
        await saveSafely(extractedOpportunityDocument);

        this.processLogger.info('Extracted all the fields! 🥳🍾');

        this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url).finishedSuccessfully().addDetail('Extracted all the fields! 🥳🍾'));

        // emit an event to make manager release another from queue or whatever.
        this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, extractedOpportunityDocument);
      } else {
        if (Object.keys(relevantLinks).length < 1) {
          extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.PARTIALLY_EXTRACTED;
          await saveSafely(extractedOpportunityDocument);

          this.processLogger.broadcast(
            new ExtractionProcessUpdateDto(this.url)
              .finishedSuccessfully()
              .addDetail('Some fields are missing but no relevant links were found! needs manual review 📝'),
          );

          this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, extractedOpportunityDocument, this.processLogger);
          this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionCompleted, extractedOpportunityDocument);
        } else {
          extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.PARTIALLY_EXTRACTED;
          await saveSafely(extractedOpportunityDocument);

          this.processLogger.broadcast(
            new ExtractionProcessUpdateDto(this.url).addDetail('Some fields are missing but relevant links were found! (promising) 🧐🔎'),
          );

          this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionRecurseNeeded, relevantLinks, extractedOpportunityDocument);
        }
      }
    } else {
      const isDoomed = anyOtherRequestingFields.every(fieldName => {
        const field = extractedOpportunityDocument[fieldName] as Field<FieldPossibleTypes>;
        return !isValidUri(field.relevantLink);
      });

      if (isDoomed) {
        this.processLogger.info('Already nested but still missing field. Going to call it a day for this URL. 🤷');
        this.processLogger.broadcast(
          new ExtractionProcessUpdateDto(this.url)
            .finishedSuccessfully()
            .addDetail('Already nested but still missing field. Going to call it a day for this URL. 🤷'),
        );
        extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.PARTIALLY_EXTRACTED;
      } else {
        this.processLogger.broadcast(
          new ExtractionProcessUpdateDto(this.url)
            .finishedSuccessfully()
            .addDetail('Finally found all the fields after visiting a relevant URL! 🥳🍾'),
        );
        extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.FULLY_EXTRACTED;
      }

      this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, extractedOpportunityDocument, this.processLogger);
      this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionCompleted, extractedOpportunityDocument);

      await saveSafely(extractedOpportunityDocument);
    }
  }

  private segmentMethod(htmlChunk: string, identifier: string) {
    const segments = htmlChunk.split(identifier);
    let success = true;
    if (segments.length === 1) {
      success = false;
    }
    return { success, segments: identifier === '<h1' ? segments.reverse() : segments };
  }

  private segmentTheChunk(htmlChunk: string, separatorIndex = 0): NestedStringArray {
    // should i chunk it more?
    const numOfTokens = this.countTokens([this.systemMessage, this.getUserMessage(htmlChunk)]);
    if (ChatGPTService.tokenLimit / 2 < numOfTokens) {
      const nextSeparator = this.segmentSplittingIdentifiers.length - 1 === separatorIndex ? separatorIndex : separatorIndex + 1;
      const { success, segments } = this.segmentMethod(htmlChunk, this.segmentSplittingIdentifiers[separatorIndex]);
      if (success) {
        return segments.map(s => this.segmentTheChunk(s, nextSeparator));
      }
      if (nextSeparator === separatorIndex) {
        return [''];
      }
      return this.segmentTheChunk(htmlChunk, nextSeparator);
    } else {
      return [htmlChunk];
    }
  }
  private getUserMessage(chunk: string, requestingFields: string[] = this.getRequestingFields()) {
    let whereClauses = '';
    let jsonString = '';
    requestingFields.forEach((fieldName, index) => {
      const field = this.extractedOpportunityDocument[fieldName] as Field<FieldPossibleTypes>;
      if (field.contextAwarenessHelper) {
        whereClauses += `${field.contextAwarenessHelper}\n`;
      }
      jsonString += `"${fieldName}": Value<${field.fieldType}>`;
      if (index !== requestingFields.length - 1) {
        jsonString += ',';
      }
    });

    return `Your replies must be only JSON. Extract from this chunk:

${chunk}
---
Follow this JSON format strictly. Imagine that \`relevant_link\` is a data type in JavaScript which is a valid string of any URI found in the HTML chunk. 

Each JSON property's value must be an object in this format.
type Value<T> = {
  data: T,
  relevant_link: string
}

where \`relevant_link\` is any URI to relevant information about the context of the JSON object property.
${whereClauses}
---
{
  ${jsonString}
}`;
  }

  private getRequestingFields(): string[] {
    return Object.keys(InterestingFields).filter(f => {
      // return value -> false: not requesting (it's filled) - true: requesting (it's missing)
      const field = this.extractedOpportunityDocument[f] as Field<FieldPossibleTypes>;
      // if (isValidUrl(field.relevantLink)) {
      //   return false;
      // }
      if (
        field.data === null ||
        field.data === undefined ||
        (typeof field.data === 'string' && field.data.length < 1) ||
        (Array.isArray(field.data) && field.data.length < 1) ||
        (typeof field.data === 'number' && isNaN(field.data))
      ) {
        return true;
      }
      if (!InterestingFields[f].shouldOverwrite) {
        // if it shouldn't be overridden, then it's filled.
        return false;
      }
      let data: FieldPossibleTypes;
      switch (field.fieldType) {
        case 'string':
          return field.data === '';
        case 'string[]':
          data = field.data as string[];
          return data?.filter(d => d !== '').length < 1 ?? true;
        case 'number':
          data = field.data as number;
          return isNaN(data);
        case 'number[]':
          data = field.data as number[];
          return data?.filter(d => !isNaN(d)).length < 1 ?? true;
        case 'date':
          return field.data === '';
      }
    });
  }

  private countTokens(messages: string[]) {
    let totalTokens = 0;

    for (const message of messages) {
      totalTokens += 4; // every message follows <im_start>{role/name}\n{content}<im_end>\n
      totalTokens += encode(message).length;
    }
    totalTokens += 2; // every reply is primed with <im_start>assistant

    return totalTokens;
  }

  private async getStrippedBodyHTML(_$: cheerio.CheerioAPI) {
    _$('body script, body footer, body noscript, body style, body link, body header, body svg').remove();

    const strippedBody = await minify(_$('body').html(), {
      collapseWhitespace: true,
      removeComments: true,
      removeEmptyElements: true,
      removeEmptyAttributes: true,
      removeOptionalTags: true,
      removeRedundantAttributes: true,
    });

    const $ = cheerio.load(strippedBody, {}, false);

    $('*').each(function (i, elem) {
      if (elem.hasOwnProperty('attribs')) {
        elem = elem as cheerio.Element;
        if (!elem.attribs.href || elem.attribs.href === '#') {
          elem.attribs = {};
          return;
        }
        elem.attribs = {
          href: elem.attribs.href,
        };
      }
    });

    $('div, section, table, aside').each((index, element) => {
      if (!element.childNodes.find(c => c.type === 'text')) {
        $(element).unwrap();
        if (element.children.length === 0) {
          $(element).remove();
        } else {
          $(element).children().unwrap();
        }
      }
      // if (['div', 'section', 'table'].includes(element.tagName)) {
      //   console.log(
      //     'childNodes[0].type',
      //     element.childNodes.map(c => c?.type ?? ''),
      //     'tagName',
      //     element.tagName,
      //     !element.childNodes.find(c => c.type === 'text'),
      //     element.children.length,
      //   );
      // }
    });

    return $.html();
  }
}
