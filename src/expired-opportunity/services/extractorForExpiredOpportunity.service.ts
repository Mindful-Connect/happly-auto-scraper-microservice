import { Injectable, Scope } from '@nestjs/common';
import {
  ExpiredOpportunityDocument,
  interestingFields as expiredOpportunityInterestingFields,
} from '@/expired-opportunity/expiredOpportunity.schema';
import { ChatGPTService } from '@/openai/services/chatgpt.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProcessLogger } from '@/auto-scraper/libraries/processLogger.lib';
import * as cheerio from 'cheerio';
import axios from 'axios';
import * as https from 'https';
import * as crypto from 'crypto';
import { getCheerioAPIFromHTML, getStrippedBodyHTML, isValidDateString, isValidRelevantLink } from '@/_domain/helpers/helperFunctions';
import { ExpiredOpportunityScrapingStatusEnum } from '@/expired-opportunity/enums/expiredOpportunityScrapingStatus.enum';
import puppeteer from 'puppeteer';
import { saveSafely } from '@/_domain/helpers/mongooseHelpers';
import { chooseModelByTokens, countTokens } from '@/openai/helpers/openai.helper';
import { GPTFinishReason, TokenLimits } from '@/openai/openai.types';
import { Field, FieldPossibleTypes, FieldPossibleTypesString } from '@/extracted-opportunity/schemas/field.schema';
import { isFieldEmpty } from '@/extracted-opportunity/opportunity.helpers';
import { ExpiredOpportunityPoolItemModel } from '@/expired-opportunity/models/expiredOpportunityPoolItem.model';

@Injectable({ scope: Scope.TRANSIENT })
export class ExtractorForExpiredOpportunityService {
  public poolIndex: number;
  public url: string;
  public doc: ExpiredOpportunityDocument;
  public isNested: boolean;
  public endEarlyDueToSameStatus = false;

  private static SystemMessage =
    'Given a chunk of HTML text, extract information asked by the user, and reply only in JSON format. your replies must be fully parsable by JSON.parse method in JavaScript.';

  private static SegmentSplittingIdentifiers: string[] = ['<h1', '<h2', '<h3', '<p', '. '];

  constructor(private chatGPTService: ChatGPTService, private eventEmitter: EventEmitter2, public processLogger: ProcessLogger) {}

  setExtractingOpportunityQueueItem(expiredOpportunityPoolItemModel: ExpiredOpportunityPoolItemModel) {
    this.poolIndex = expiredOpportunityPoolItemModel.index;
    this.url = expiredOpportunityPoolItemModel.url;
    this.doc = expiredOpportunityPoolItemModel.doc;
    this.isNested = expiredOpportunityPoolItemModel.isNested;
  }

  async extract(): Promise<[string[], number, ExpiredOpportunityDocument]> {
    const doc = this.doc;

    this.processLogger.document = doc;

    if (doc.failedToFetchPageCount > 3) {
      doc.errorDetails = 'Failed to fetch page';
      doc.status = ExpiredOpportunityScrapingStatusEnum.Failed;

      return await this.finishAndReturn();
    }

    if (doc.isPermanentlyClosed) {
      doc.errorDetails = 'This Opportunity is permanently closed';
      doc.status = ExpiredOpportunityScrapingStatusEnum.Failed;

      return await this.finishAndReturn();
    }

    let $: cheerio.CheerioAPI;
    if (doc.clientRenderedPage === null) {
      try {
        $ = await this.getCheerioAPIStatic();
      } catch (e) {
        doc.failedToFetchPageCount += 1;

        // the page is not accessible.So we need to review it manually
        doc.errorDetails = 'Page is not accessible';
        doc.status = ExpiredOpportunityScrapingStatusEnum.Failed;

        return await this.finishAndReturn();
      }

      doc.clientRenderedPage = $('p').length < 2;
      await saveSafely(doc);

      if (doc.clientRenderedPage) {
        this.processLogger.info('Client rendered page detected, using puppeteer... 📦🪄');
        $ = await this.getCheerioAPIPuppeteer();
      }
    } else {
      if (doc.clientRenderedPage) {
        $ = await this.getCheerioAPIPuppeteer();
      } else {
        $ = await this.getCheerioAPIStatic();
      }
    }

    let stripped: string;
    try {
      stripped = await getStrippedBodyHTML($);
    } catch (e) {
      doc.errorDetails = 'Could not strip the HTML body... 🫣';
      doc.status = ExpiredOpportunityScrapingStatusEnum.Failed;
      console.error(doc.errorDetails, e);

      return await this.finishAndReturn();
    }

    const chunks = this.segmentTheChunk(stripped);
    let fragments = chunks.flat(<10000>Infinity).filter(c => c !== '') as string[];

    let missingFieldsInGPTResponseCount = 0;
    let retriesCount = 0;
    const maxRetries = 2;
    const fragmentsRemember = [...fragments];
    let awaitingRetriesBecauseMissingFields = 0; // This is a hacky way to retry the extraction if ChatGPT misses some fields due to lack of tokens
    while (fragments.length > 0 || awaitingRetriesBecauseMissingFields > 0) {
      if (missingFieldsInGPTResponseCount > 3) {
        break;
      }

      if (fragments.length === 0 && awaitingRetriesBecauseMissingFields > 0) {
        fragments = fragmentsRemember;
        awaitingRetriesBecauseMissingFields--;
      }

      const requestingFields = ['application_deadline_date'];

      const readyToBeSent: string[] = [];

      const quotient = 1.3;
      const tokensLimitPerRequest = TokenLimits['gpt-3.5-turbo'] / quotient;

      while (
        fragments.length > 0 &&
        tokensLimitPerRequest >=
          countTokens([ExtractorForExpiredOpportunityService.SystemMessage, this.getUserMessage(readyToBeSent.join('') + fragments[0])])
      ) {
        readyToBeSent.push(fragments.shift());
      }

      if (readyToBeSent.length === 0) {
        this.processLogger.info('No more chunks to be sent to ChatGPT... 🚚🚚🚚 This might be an error... 🤔', fragments);
        break;
      }

      const userMessage = this.getUserMessage(readyToBeSent.join(''));

      const totalMessagesToken = countTokens([ExtractorForExpiredOpportunityService.SystemMessage, userMessage]);

      const [gptModel, tokenLimit] = chooseModelByTokens(totalMessagesToken, requestingFields.length);

      try {
        const gptResponse = await this.chatGPTService.getResponseWithBackoffForRateLimit(new AbortController(), {
          model: gptModel,
          messages: [
            {
              role: 'system',
              content: ExtractorForExpiredOpportunityService.SystemMessage,
            },
            {
              role: 'user',
              content: userMessage,
            },
          ],
          temperature: 0.4,
          max_tokens: tokenLimit - totalMessagesToken, // completion token.
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
          n: 1,
          stream: false,
        });

        const finishReason: GPTFinishReason = gptResponse.choices[0].finish_reason;
        if (finishReason !== GPTFinishReason.STOP) {
          doc.status = ExpiredOpportunityScrapingStatusEnum.Failed;
          doc.errorDetails = `ChatGPT did not finish successfully... ❌🧠🤖 Reason: ${finishReason}`;

          missingFieldsInGPTResponseCount++;

          this.processLogger.info(doc.errorDetails, gptResponse);
          continue;
        }

        const responseStringJson = gptResponse.choices[0].message.content;
        let response;
        try {
          response = JSON.parse(responseStringJson);
        } catch (invalidJsonError) {
          doc.status = ExpiredOpportunityScrapingStatusEnum.Failed;
          doc.errorDetails = `ChatGPT response is not a valid JSON... ❌🧠🤖`;

          this.processLogger.info(doc.errorDetails, invalidJsonError, responseStringJson);
          continue;
        }

        Object.keys(response).forEach(key => {
          const value: { data: any; relevant_link: string | null } = response[key];

          if (requestingFields.includes(key)) {
            const field = doc[key] as Field<FieldPossibleTypes>;

            // If the field is not empty, only overwrite it if the field is marked as `shouldOverwrite`.
            // Otherwise, only overwrite it if the field is empty.
            if (!isFieldEmpty(field.fieldType, field.data)) {
              if (this.shouldHardOverwrite(key as any, field.fieldType, field.data, value.data)) {
                field.data = value.data;
                doc.status = ExpiredOpportunityScrapingStatusEnum.Updated;
              }
            } else {
              field.data = value.data;
            }

            field.relevantLink = isValidRelevantLink(value.relevant_link, doc.url) ? value.relevant_link : field.relevantLink;
          }
        });

        // If the response has the same status as the previous one, then we can finish the process.
        if (this.endEarlyDueToSameStatus) {
          return await this.finishAndReturn();
        }

        // Count the times that GPT missed some fields
        if (this.areTooManyFieldsMissingInGPTResponse(Object.keys(response), requestingFields) && maxRetries > retriesCount) {
          missingFieldsInGPTResponseCount++;
          awaitingRetriesBecauseMissingFields++;
          retriesCount++;
        }
      } catch (e) {
        const error = typeof e === 'object' && 'name' in e ? (e as Error) : new Error(e.toString());
        if (error.name === 'CanceledError') {
          this.processLogger.info('ChatGPT request was canceled... ❌🧠🤖', e);
          return;
        }
        doc.status = ExpiredOpportunityScrapingStatusEnum.Failed;
        doc.errorDetails = `ChatGPT failed to respond... ❌🧠🤖 Reason: ${error.message ?? 'Unknown'}`;

        this.processLogger.info(doc.errorDetails, e);
        console.error(e);
      } finally {
        // save in db
        await saveSafely(doc);
      }
    }

    return await this.finishAndReturn();
  }

  private shouldHardOverwrite(fieldName: string, fieldType: FieldPossibleTypesString, prevValue: any, newValue: any) {
    if (isFieldEmpty(fieldType, newValue)) return false;
    if (isFieldEmpty(fieldType, prevValue)) return true; // safety check

    switch (fieldName) {
      case 'application_deadline_date':
        if (isValidDateString(prevValue)) {
          if (isValidDateString(newValue)) {
            // if they are equal then we should not overwrite
            if (Date.parse(prevValue) === Date.parse(newValue)) {
              this.endEarlyDueToSameStatus = true;
              return false;
            }
            return true;
          }
          if (Date.parse(prevValue) >= Date.now()) {
            return newValue.toLowerCase() === 'permanently closed';
          }
          return newValue.toLowerCase() === 'open until filled';
        }
        if (prevValue.toLowerCase() === 'open until filled') {
          return true;
        }
        if (prevValue.toLowerCase() === 'permanently closed') {
          return (isValidDateString(newValue) && Date.parse(newValue) >= Date.now()) || newValue.toLowerCase() === 'open until filled';
        }
        return true;
      default:
        return true;
    }
  }

  private areTooManyFieldsMissingInGPTResponse(responseKeysFromGPT: string[], requestingFields: string[]): boolean {
    for (const field of requestingFields) {
      if (!responseKeysFromGPT.includes(field)) {
        return true;
      }
      if (responseKeysFromGPT[field] === null || responseKeysFromGPT[field] === '') {
        return true;
      }
    }
  }

  private getRequestingFields(): string[] {
    return ['application_deadline_date'];
  }

  private getUserMessage(chunk: string, requestingFields: string[] = this.getRequestingFields()) {
    let whereClauses = '';
    let jsonString = '';
    requestingFields.forEach((fieldName, index) => {
      const field = this.doc[fieldName] as Field<FieldPossibleTypes>;
      if (expiredOpportunityInterestingFields[fieldName].contextAwarenessHelper) {
        whereClauses += `${expiredOpportunityInterestingFields[fieldName].contextAwarenessHelper}\n`;
      }
      jsonString += `"${fieldName}": Value<${field.fieldType}>`;
      if (index !== requestingFields.length - 1) {
        jsonString += ',';
      }
    });

    return `Your reply must be fully parsable by JSON.parse method in JavaScript. Your replies must be ONLY in JSON. You must include all the fields in your response.
Extract from this chunk:

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

  private segmentTheChunk(htmlChunk: string, separatorIndex = 0): NestedStringArray {
    // should i chunk it more?
    const numOfTokens = countTokens([ExtractorForExpiredOpportunityService.SystemMessage, this.getUserMessage(htmlChunk)]);
    if (TokenLimits['gpt-3.5-turbo'] / 2 < numOfTokens) {
      const nextSeparator =
        ExtractorForExpiredOpportunityService.SegmentSplittingIdentifiers.length - 1 === separatorIndex ? separatorIndex : separatorIndex + 1;
      const { success, segments } = this.segmentMethod(htmlChunk, ExtractorForExpiredOpportunityService.SegmentSplittingIdentifiers[separatorIndex]);
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

  private segmentMethod(htmlChunk: string, identifier: string) {
    const segments = htmlChunk.split(identifier);
    let success = true;
    if (segments.length === 1) {
      success = false;
    }
    return { success, segments: identifier === '<h1' ? segments.reverse() : segments };
  }

  private async getCheerioAPIStatic() {
    const pageHTML = await axios.get(this.url, {
      httpsAgent: new https.Agent({
        // for self signed you could also add
        // rejectUnauthorized: false,

        // allow legacy server
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
      }),
    });

    return getCheerioAPIFromHTML(pageHTML.data);
  }

  private async getCheerioAPIPuppeteer() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto(this.url);

    const pageHTML = await page.content();
    return getCheerioAPIFromHTML(pageHTML);
  }

  private async finishAndReturn(relevantLinks: string[] = []): Promise<[string[], number, ExpiredOpportunityDocument]> {
    this.doc.lastScrapedAt = new Date();
    await saveSafely(this.doc);
    return [relevantLinks, this.poolIndex, this.doc];
  }
}
