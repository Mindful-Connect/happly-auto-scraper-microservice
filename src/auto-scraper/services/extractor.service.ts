import {
  ExtractedOpportunityDocument,
  interestingFields as extractedOpportunityInterestingFields,
  overwritableFields,
} from '@/extracted-opportunity/schemas/extractedOpportunity.schema';
import * as cheerio from 'cheerio';
import axios from 'axios';
import puppeteer from 'puppeteer';
import { ChatGPTService } from '@/openai/services/chatgpt.service';
import { Field, FieldPossibleTypes, FieldPossibleTypesString } from '@/extracted-opportunity/schemas/field.schema';
import { GPTFinishReason, TokenLimits } from '@/openai/openai.types';
import { AutoScraperQueueStatusEnum } from '@/auto-scraper/enums/autoScraperQueueStatus.enum';
import { getCheerioAPIFromHTML, getStrippedBodyHTML, isValidDateString, isValidRelevantLink, isValidUri } from '@/_domain/helpers/helperFunctions';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OpportunityEventNamesEnum } from '@/auto-scraper/enums/opportunityEventNames.enum';
import { ExtractionProcessUpdateDto } from '@/auto-scraper/dtos/extractionProcessUpdate.dto';
import { ProcessLogger } from '../libraries/processLogger.lib';
import { ExtractingOpportunitiesQueueItem } from '@/auto-scraper/models/extractingOpportunitiesQueueItem.model';
import { saveSafely } from '@/_domain/helpers/mongooseHelpers';
import { chooseModelByTokens, countTokens } from '@/openai/helpers/openai.helper';
import { QueueItemSourceEnum } from '@/happly/enums/queueItemSource.enum';
import * as https from 'https';
import * as crypto from 'crypto';
import { Injectable, Scope } from '@nestjs/common';
import { isFieldEmpty } from '@/extracted-opportunity/opportunity.helpers';

@Injectable({ scope: Scope.TRANSIENT })
export class ExtractorService {
  public url: string;
  public extractedOpportunityDocument: ExtractedOpportunityDocument;
  public isNested: boolean;
  public gptAbortController: AbortController | null = null;

  private static SystemMessage =
    'Given a chunk of HTML text, extract information asked by the user, and reply only in JSON format. your replies must be fully parsable by JSON.parse method in JavaScript.';

  private static SegmentSplittingIdentifiers: string[] = ['<h1', '<h2', '<h3', '<p', '. '];

  constructor(private chatGPTService: ChatGPTService, private eventEmitter: EventEmitter2, public processLogger: ProcessLogger) {}

  setExtractingOpportunityQueueItem(extractingOpportunitiesQueueItem: ExtractingOpportunitiesQueueItem) {
    this.url = extractingOpportunitiesQueueItem.url;
    this.extractedOpportunityDocument = extractingOpportunitiesQueueItem.extractingOpportunityDocument;
    this.isNested = extractingOpportunitiesQueueItem.isNested;
  }

  async extractOpportunity() {
    // Assigning the `this.extractedOpportunityDocument` to a variable to make it easier to access
    const doc = this.extractedOpportunityDocument;

    this.processLogger.document = doc;

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
      const pageHTML = await axios.get(this.url, {
        httpsAgent: new https.Agent({
          // for self signed you could also add
          // rejectUnauthorized: false,

          // allow legacy server
          secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
        }),
      });

      $ = getCheerioAPIFromHTML(pageHTML.data);
    }
    this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 5));

    let stripped: string;
    try {
      stripped = await getStrippedBodyHTML($);
      this.processLogger.broadcast(
        new ExtractionProcessUpdateDto(this.url, 2).addDetail('Stripped the HTML body... 🫣 to make it shorter for ChatGPT ✨'),
        { stripped },
      );
    } catch (e) {
      console.error('Could not strip the HTML body... 🫣', e);
      this.extractedOpportunityDocument.errorDetails = 'Could not strip the HTML body... 🫣';
      this.extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.FAILED_TO_PROCESS;
      this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, this.extractedOpportunityDocument, this.processLogger);
      return;
    }

    const chunks = this.segmentTheChunk(stripped);
    let fragments = chunks.flat(<10000>Infinity).filter(c => c !== '') as string[];
    this.processLogger.broadcast(
      new ExtractionProcessUpdateDto(this.url, 2).addDetail('Segmented the HTML chunk into smaller chunks if necessary... 🪄🗃️'),
      { fragments },
    );

    let missingFieldsInGPTResponseCount = 0;
    let retriesCount = 0;
    const maxRetries = 2;
    const fragmentsRemember = [...fragments];
    let awaitingRetriesBecauseMissingFields = 0; // This is a hacky way to retry the extraction if ChatGPT misses some fields due to lack of tokens
    while (fragments.length > 0 || awaitingRetriesBecauseMissingFields > 0) {
      if (missingFieldsInGPTResponseCount > 3) {
        this.processLogger.broadcast(
          new ExtractionProcessUpdateDto(this.url).addDetail(
            "ChatGPT missed too many fields too many times. There's something wrong with the HTML... " +
              'Maybe the page does not have relative information about one specific opportunity 🤔',
          ),
        );
        break;
      }
      if (fragments.length === 0 && awaitingRetriesBecauseMissingFields > 0) {
        this.processLogger.broadcast(
          new ExtractionProcessUpdateDto(this.url, 1).addDetail(
            'ChatGPT missed some fields due to lack of tokens, retrying with the missing fields... 🔁',
          ),
        );
        fragments = fragmentsRemember;
        awaitingRetriesBecauseMissingFields--;
      }

      const requestingFields = this.reviseRequestingFields(this.getRequestingFields());
      this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 1).addDetail('Deciding which missing fields to request... 🔍📦'), {
        requestingFields,
      });

      if (requestingFields.length === 0) {
        this.processLogger.info('No more missing fields to request... 📦📦📦');
        break;
      }

      const readyToBeSent: string[] = [];

      this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 1));

      let quotient = 1.36;
      if (requestingFields.length >= 30) {
        quotient = 2;
      } else if (requestingFields.length >= 20) {
        quotient = 1.7;
      } else if (requestingFields.length >= 10) {
        quotient = 1.5;
      }
      const tokensLimitPerRequest = TokenLimits['gpt-3.5-turbo'] / quotient;

      while (
        fragments.length > 0 &&
        tokensLimitPerRequest >= countTokens([ExtractorService.SystemMessage, this.getUserMessage(readyToBeSent.join('') + fragments[0])])
      ) {
        this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 1).addDetail('Gathering chunks to be sent to ChatGPT... 🚚'));
        readyToBeSent.push(fragments.shift());
      }

      if (readyToBeSent.length === 0) {
        this.processLogger.info('No more chunks to be sent to ChatGPT... 🚚🚚🚚 This might be an error... 🤔', fragments);
        break;
      }

      this.processLogger.info('Gathering chunks to be sent to ChatGPT... 🚚', { readyToBeSent });

      const userMessage = this.getUserMessage(readyToBeSent.join(''));

      const totalMessagesToken = countTokens([ExtractorService.SystemMessage, userMessage]);

      const [gptModel, tokenLimit] = chooseModelByTokens(totalMessagesToken, requestingFields.length);

      try {
        this.processLogger.broadcast(
          new ExtractionProcessUpdateDto(this.url, 10).addDetail('Sending request to ChatGPT... 🧠🤖 This might take a few seconds ⏳'),
        );
        this.gptAbortController = new AbortController();
        const gptResponse = await this.chatGPTService.getResponseWithBackoffForRateLimit(this.gptAbortController, {
          model: gptModel,
          messages: [
            {
              role: 'system',
              content: ExtractorService.SystemMessage,
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
        this.gptAbortController = null;

        this.processLogger.info(
          'Received response from ChatGPT... ✅🧠🤖 | requestingFields.length = ' +
            requestingFields.length +
            ', tokensLimitPerRequest = ' +
            tokensLimitPerRequest +
            ', totalMessagesToken_expected = ' +
            totalMessagesToken +
            ', gptModel = ' +
            gptModel +
            ', real usage = ' +
            JSON.stringify(gptResponse.usage),
          gptResponse,
        );

        const finishReason: GPTFinishReason = gptResponse.choices[0].finish_reason;
        if (finishReason !== GPTFinishReason.STOP) {
          doc.status = AutoScraperQueueStatusEnum.GPT_ERROR;
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
          doc.status = AutoScraperQueueStatusEnum.GPT_ERROR;
          doc.errorDetails = `ChatGPT response is not a valid JSON... ❌🧠🤖`;

          this.processLogger.info(doc.errorDetails, invalidJsonError, responseStringJson);
          continue;
        }

        Object.keys(response).forEach(key => {
          const value: { data: any; relevant_link: string | null } = response[key];
          if (requestingFields.includes(key)) {
            this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 0.01));
            doc.status = AutoScraperQueueStatusEnum.PARTIALLY_EXTRACTED;

            const field = doc[key] as Field<FieldPossibleTypes>;

            // If the field is not empty, only overwrite it if the field is marked as `shouldOverwrite`.
            // Otherwise, only overwrite it if the field is empty.
            if (!isFieldEmpty(field.fieldType, field.data)) {
              if (overwritableFields.includes(key as any) && this.shouldHardOverwrite(key as any, field.fieldType, field.data, value.data)) {
                field.data = value.data;
              }
            } else {
              field.data = value.data;
            }

            // Do not overwrite the relevant link if it is already set to a valid value.
            field.relevantLink = isValidRelevantLink(value.relevant_link, this.extractedOpportunityDocument.url)
              ? value.relevant_link
              : field.relevantLink;
          }
        });

        // Check if scraping round is finished
        if (fragments.length === 0) {
          if (this.getRequestingFields().length > 10 && maxRetries > retriesCount) {
            awaitingRetriesBecauseMissingFields++;
            retriesCount++;
          }
        }

        // Count the times that GPT missed some fields
        if (this.areTooManyFieldsMissingInGPTResponse(Object.keys(response), requestingFields)) {
          missingFieldsInGPTResponseCount++;
        }

        this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 5).addDetail('Saved the response in the database... ✅📦🗃️'));
      } catch (e) {
        const error = typeof e === 'object' && 'name' in e ? (e as Error) : new Error(e.toString());
        if (error.name === 'CanceledError') {
          this.processLogger.info('ChatGPT request was canceled... ❌🧠🤖', e);
          return;
        }
        doc.status = AutoScraperQueueStatusEnum.GPT_ERROR;
        doc.errorDetails = `ChatGPT failed to respond... ❌🧠🤖 Reason: ${error.message ?? 'Unknown'}`;

        this.processLogger.info(doc.errorDetails, e);
        console.error(e);
      } finally {
        // save in db
        await saveSafely(doc);
      }
    }

    // emit an event to make manager release another from queue or whatever.
    this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, doc, this.processLogger);

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
        doc.status = AutoScraperQueueStatusEnum.FULLY_EXTRACTED;
        await saveSafely(doc);

        this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url).finishedSuccessfully().addDetail('Extracted all the fields! 🥳🍾'));

        this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionCompleted, doc);
      } else {
        if (Object.keys(relevantLinks).length < 1) {
          doc.status = AutoScraperQueueStatusEnum.PARTIALLY_EXTRACTED;
          await saveSafely(doc);

          this.processLogger.broadcast(
            new ExtractionProcessUpdateDto(this.url)
              .finishedSuccessfully()
              .addDetail('Some fields are missing but no relevant links were found! needs manual review 📝'),
          );

          this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionCompleted, doc);
        } else {
          doc.status = AutoScraperQueueStatusEnum.PARTIALLY_EXTRACTED;
          await saveSafely(doc);

          this.processLogger.broadcast(
            new ExtractionProcessUpdateDto(this.url).addDetail('Some fields are missing but relevant links were found! (promising) 🧐🔎'),
          );

          this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionRecurseNeeded, relevantLinks, doc);
        }
      }
    } else {
      const isDoomed = anyOtherRequestingFields.every(fieldName => {
        const field = doc[fieldName] as Field<FieldPossibleTypes>;
        return !isValidRelevantLink(field.relevantLink, this.extractedOpportunityDocument.url);
      });

      if (isDoomed) {
        this.processLogger.broadcast(
          new ExtractionProcessUpdateDto(this.url)
            .finishedSuccessfully()
            .addDetail('Already nested but still missing field. Going to call it a day for this URL. 🤷'),
        );
        doc.status = AutoScraperQueueStatusEnum.PARTIALLY_EXTRACTED;
      } else {
        this.processLogger.broadcast(
          new ExtractionProcessUpdateDto(this.url)
            .finishedSuccessfully()
            .addDetail('Finally found all the fields after visiting a relevant URL! 🥳🍾'),
        );
        doc.status = AutoScraperQueueStatusEnum.FULLY_EXTRACTED;
      }

      this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionCompleted, doc);

      await saveSafely(doc);
    }
  }

  private areTooManyFieldsMissingInGPTResponse(responseKeysFromGPT: string[], requestingFields: string[]): boolean {
    let missingFields = 0;
    const threshold = requestingFields.length / 2;
    for (const field of requestingFields) {
      if (!responseKeysFromGPT.includes(field)) {
        missingFields++;
      }
      if (missingFields > threshold) return true;
    }
    return missingFields > threshold;
  }

  private shouldHardOverwrite(fieldName: (typeof overwritableFields)[number], fieldType: FieldPossibleTypesString, prevValue: any, newValue: any) {
    if (!overwritableFields.includes(fieldName) || isFieldEmpty(fieldType, newValue)) return false;
    if (isFieldEmpty(fieldType, prevValue)) return true; // safety check

    switch (fieldName) {
      case 'application_deadline_date':
        if (isValidDateString(prevValue)) {
          if (isValidDateString(newValue)) {
            return true;
          }
          if (Date.parse(prevValue) >= Date.now()) {
            return newValue.toLowerCase() === 'closed';
          }
          return newValue.toLowerCase() === 'open until filled';
        }
        if (prevValue.toLowerCase() === 'open until filled') {
          return true;
        }
        if (prevValue.toLowerCase() === 'closed') {
          return (isValidDateString(newValue) && Date.parse(newValue) >= Date.now()) || newValue.toLowerCase() === 'open until filled';
        }
        return true;
      case 'application_opening_date':
        if (!isValidDateString(prevValue)) return true;
        return isValidDateString(newValue);
      case 'application_process_time':
        return ['Quick', 'Moderate', 'Long'].includes(newValue);
      default:
        return false;
    }
  }

  private reviseRequestingFields(requestingFields: string[]) {
    const source = this.extractedOpportunityDocument.source;

    if (QueueItemSourceEnum.ExpiredOpportunity === source) {
      const deadline = this.extractedOpportunityDocument.application_deadline_date.data;
      if (isValidDateString(deadline) && Date.parse(deadline) >= Date.now()) {
        requestingFields = requestingFields.filter(field => field !== 'application_deadline_date');
      }
      const opening = this.extractedOpportunityDocument.application_opening_date.data;
      if (isValidDateString(opening)) {
        requestingFields = requestingFields.filter(field => field !== 'application_opening_date');
      }
      const processingTime = this.extractedOpportunityDocument.application_process_time.data;
      if (processingTime !== 'Quick') {
        requestingFields = requestingFields.filter(field => field !== 'application_process_time');
      }
    }

    return requestingFields;
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
    const numOfTokens = countTokens([ExtractorService.SystemMessage, this.getUserMessage(htmlChunk)]);
    if (TokenLimits['gpt-3.5-turbo'] / 2 < numOfTokens) {
      const nextSeparator = ExtractorService.SegmentSplittingIdentifiers.length - 1 === separatorIndex ? separatorIndex : separatorIndex + 1;
      const { success, segments } = this.segmentMethod(htmlChunk, ExtractorService.SegmentSplittingIdentifiers[separatorIndex]);
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
      if (extractedOpportunityInterestingFields[fieldName].contextAwarenessHelper) {
        whereClauses += `${extractedOpportunityInterestingFields[fieldName].contextAwarenessHelper}\n`;
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

  private getRequestingFields(): string[] {
    return Object.keys(extractedOpportunityInterestingFields).filter(f => {
      // return value -> false: not requesting (it's filled) - true: requesting (it's missing)
      const field = this.extractedOpportunityDocument[f] as Field<FieldPossibleTypes>;

      const isEmpty = isFieldEmpty(field.fieldType, field.data);
      const shouldOverwrite = overwritableFields.includes(f as (typeof overwritableFields)[number]);

      return isEmpty ? true : shouldOverwrite;
    });
  }
}
