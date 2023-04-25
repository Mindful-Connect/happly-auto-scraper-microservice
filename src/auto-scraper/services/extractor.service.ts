import { ExtractedOpportunityDocument, interestingFields, overwritableFields } from '@/extracted-opportunity/schemas/extractedOpportunity.schema';
import * as cheerio from 'cheerio';
import axios from 'axios';
import puppeteer from 'puppeteer';
import { minify } from 'html-minifier-terser';
import { encode } from 'gpt-3-encoder';
import { ChatGPTService } from '@/openai/services/chatgpt.service';
import { Field, FieldPossibleTypes, FieldPossibleTypesString } from '@/extracted-opportunity/schemas/field.schema';
import { GPTFinishReason, TokenLimits } from '@/openai/openai.types';
import { AutoScraperQueueStatusEnum } from '@/auto-scraper/enums/autoScraperQueueStatus.enum';
import { getCheerioAPIFromHTML, isValidDateString, isValidUri } from '@/_domain/helpers/helperFunctions';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OpportunityEventNamesEnum } from '@/auto-scraper/enums/opportunityEventNames.enum';
import { ExtractionProcessUpdateDto } from '@/auto-scraper/dtos/extractionProcessUpdate.dto';
import { ProcessLogger } from '../libraries/processLogger.lib';
import { ExtractingOpportunitiesQueueItem } from '@/auto-scraper/models/ExtractingOpportunitiesQueueItem.model';
import { saveSafely } from '@/_domain/helpers/mongooseHelpers';
import { chooseModelByTokens } from '@/openai/helpers/openai.helper';
import { QueueItemSourceEnum } from '@/happly/enums/QueueItemSource.enum';

export class ExtractorService {
  public url: string;
  public extractedOpportunityDocument: ExtractedOpportunityDocument;
  public isNested: boolean;

  private systemMessage =
    'Given a chunk of HTML text, extract information asked by the user, and reply only in JSON format. your replies must be fully parsable by JSON.parse method in JavaScript.';

  private segmentSplittingIdentifiers: string[] = ['<h1', '<h2', '<h3', '<p', '. '];

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
      this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 2).addDetail('Stripped the HTML body... 🫣'));
    } catch (e) {
      console.error('Could not strip the HTML body... 🫣', e);
      this.extractedOpportunityDocument.errorDetails = 'Could not strip the HTML body... 🫣';
      this.extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.FAILED_TO_PROCESS;
      this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, this.extractedOpportunityDocument, this.processLogger);
      return;
    }

    const chunks = this.segmentTheChunk(stripped);
    let fragments = chunks.flat(<10000>Infinity).filter(c => c !== '') as string[];
    this.processLogger.info('Segmented the HTML chunk into smaller chunks if necessary... 🪄🗃️', {
      fragments,
    });
    this.processLogger.broadcast(
      new ExtractionProcessUpdateDto(this.url, 2).addDetail('Segmented the HTML chunk into smaller chunks if necessary... 🪄🗃️'),
    );

    const fragmentsRemember = [...fragments];
    let awaitingRetriesBecauseMissingFields = this.isNested ? 0 : 1; // This is a hacky way to retry the extraction if ChatGPT misses some fields due to lack of tokens
    while (fragments.length > 0 || awaitingRetriesBecauseMissingFields > 0) {
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
      this.processLogger.info('Deciding which missing fields to request... 🔍📦', { requestingFields });
      this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 1));

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
        tokensLimitPerRequest >= this.countTokens([this.systemMessage, this.getUserMessage(readyToBeSent.join('') + fragments[0])])
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

      const totalMessagesToken = this.countTokens([this.systemMessage, userMessage]);

      const [gptModel, tokenLimit] = chooseModelByTokens(totalMessagesToken, requestingFields.length);

      try {
        this.processLogger.broadcast(
          new ExtractionProcessUpdateDto(this.url, 10).addDetail('Sending request to ChatGPT... 🧠🤖 This might take a few seconds ⏳'),
        );
        console.warn('Sending request to ChatGPT... 🧠🤖 This might take a few seconds ⏳');
        const gptResponse = await this.chatGPTService.getResponse({
          model: gptModel,
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
          temperature: 0.4,
          max_tokens: tokenLimit - totalMessagesToken, // completion token.
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
          n: 1,
          stream: false,
        });

        // this.rateLimitTokenCounter += gptResponse.usage.total_tokens;

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
          extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.GPT_ERROR;
          extractedOpportunityDocument.errorDetails = `ChatGPT did not finish successfully... ❌🧠🤖 Reason: ${finishReason}`;

          this.processLogger.info(extractedOpportunityDocument.errorDetails, gptResponse);
          continue;
        }

        const responseStringJson = gptResponse.choices[0].message.content;
        let response;
        try {
          response = JSON.parse(responseStringJson);
        } catch (invalidJsonError) {
          extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.GPT_ERROR;
          extractedOpportunityDocument.errorDetails = `ChatGPT response is not a valid JSON... ❌🧠🤖`;

          this.processLogger.info(extractedOpportunityDocument.errorDetails, invalidJsonError, responseStringJson);
          continue;
        }

        Object.keys(response).forEach(key => {
          const value: { data: any; relevant_link: string | null } = response[key];
          if (requestingFields.includes(key)) {
            this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 0.01));
            extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.PARTIALLY_EXTRACTED;

            const field = extractedOpportunityDocument[key] as Field<FieldPossibleTypes>;

            // If the field is not empty, only overwrite it if the field is marked as `shouldOverwrite`.
            // Otherwise, only overwrite it if the field is empty.
            if (!this.isFieldEmpty(field.fieldType, field.data)) {
              if (overwritableFields.includes(key as any) && this.shouldHardOverwrite(key as any, field.fieldType, field.data, value.data)) {
                field.data = value.data;
              }
            } else {
              field.data = value.data;
            }

            // Do not overwrite the relevant link if it is already set to a valid value.
            field.relevantLink = this.isValidRelevantLink(value.relevant_link) ? value.relevant_link : field.relevantLink;
          }
        });

        if (this.areAnyFieldsMissing(Object.keys(response), requestingFields)) {
          awaitingRetriesBecauseMissingFields++;
        }

        this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url, 5).addDetail('Saved the response in the database... ✅📦🗃️'));
      } catch (e) {
        extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.GPT_ERROR;
        extractedOpportunityDocument.errorDetails = `ChatGPT failed to respond... ❌🧠🤖 Reason: ${e.message ?? 'Unknown'}`;

        this.processLogger.info(extractedOpportunityDocument.errorDetails, e);
        console.error(e);
      } finally {
        // save in db
        await saveSafely(extractedOpportunityDocument);
      }
    }

    // emit an event to make manager release another from queue or whatever.
    this.eventEmitter.emit(OpportunityEventNamesEnum.OpportunityExtractionPoolRelease, extractedOpportunityDocument, this.processLogger);

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

        this.processLogger.broadcast(new ExtractionProcessUpdateDto(this.url).finishedSuccessfully().addDetail('Extracted all the fields! 🥳🍾'));

        this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionCompleted, extractedOpportunityDocument);
      } else {
        if (Object.keys(relevantLinks).length < 1) {
          extractedOpportunityDocument.status = AutoScraperQueueStatusEnum.PARTIALLY_EXTRACTED;
          await saveSafely(extractedOpportunityDocument);

          this.processLogger.broadcast(
            new ExtractionProcessUpdateDto(this.url)
              .finishedSuccessfully()
              .addDetail('Some fields are missing but no relevant links were found! needs manual review 📝'),
          );

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
        return !this.isValidRelevantLink(field.relevantLink);
      });

      if (isDoomed) {
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

      this.eventEmitter.emit(OpportunityEventNamesEnum.ExtractionCompleted, extractedOpportunityDocument);

      await saveSafely(extractedOpportunityDocument);
    }
  }

  private areAnyFieldsMissing(responseKeysFromGPT: string[], requestingFields: string[]): boolean {
    for (const field of requestingFields) {
      if (!responseKeysFromGPT.includes(field)) {
        return true;
      }
    }
  }

  private shouldHardOverwrite(fieldName: (typeof overwritableFields)[number], fieldType: FieldPossibleTypesString, prevValue: any, newValue: any) {
    if (!overwritableFields.includes(fieldName) || this.isFieldEmpty(fieldType, newValue)) return false;
    if (this.isFieldEmpty(fieldType, prevValue)) return true; // safety check

    switch (fieldName) {
      case 'application_deadline_date':
        return newValue === 'Closed' || (isValidDateString(newValue) && Date.parse(newValue) >= Date.now());
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
    const numOfTokens = this.countTokens([this.systemMessage, this.getUserMessage(htmlChunk)]);
    if (TokenLimits['gpt-3.5-turbo'] / 2 < numOfTokens) {
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
    return Object.keys(interestingFields).filter(f => {
      // return value -> false: not requesting (it's filled) - true: requesting (it's missing)
      const field = this.extractedOpportunityDocument[f] as Field<FieldPossibleTypes>;

      const isFieldEmpty = this.isFieldEmpty(field.fieldType, field.data);
      const shouldOverwrite = overwritableFields.includes(f as (typeof overwritableFields)[number]);

      return isFieldEmpty ? true : shouldOverwrite;
    });
  }

  private isValidRelevantLink(link: string | null | undefined) {
    try {
      const relevantLinkURL = new URL(link);
      const programURL = new URL(this.extractedOpportunityDocument.url);

      // If the relevant link is not in the same domain as the program url, then it's valid.
      // OR, If the relevant link is in the same domain as the program url, then it's valid if the path is not the same as the program url.
      return relevantLinkURL.host !== programURL.host || (relevantLinkURL.pathname !== programURL.pathname && relevantLinkURL.pathname.length > 1);
    } catch (_) {
      // If the relevant link is not a valid URL, then it's valid if it's a valid URI.
      // differences between a URI and a URL: https://stackoverflow.com/questions/176264/what-is-the-difference-between-a-uri-a-url-and-a-urn
      return isValidUri(link);
    }
  }

  private isFieldEmpty(fieldType: FieldPossibleTypesString, data: FieldPossibleTypes) {
    if (data === null || data === undefined) {
      return true;
    }

    switch (fieldType) {
      case 'string':
        return typeof data === 'string' ? data.length < 1 : true;
      case 'string[]':
        return Array.isArray(data) ? (data as Array<unknown>).filter(d => (typeof d === 'string' ? d.length > 0 : false)).length < 1 : true;
      case 'number':
        return typeof data === 'number' ? isNaN(data) : true;
      case 'number[]':
        return Array.isArray(data) ? (data as Array<unknown>).filter(d => (typeof d === 'number' ? !isNaN(d) : false)).length < 1 : true;
      case 'date':
        if (typeof data !== 'string' || data.length < 1) return true;
        // const date = new Date(data);
        // if (isNaN(date.getTime())) return true;
        return false;
      case 'boolean':
        return typeof data !== 'boolean';
      default:
        return true;
    }
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

  /**
   * Strips the body of the HTML document of all scripts, styles, and other unnecessary tags.
   * This is done to reduce the size of the HTML document to be sent to GPT. Hence, reducing the token count.
   * @param _$
   * @private
   */
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
    });

    return $.html();
  }
}
