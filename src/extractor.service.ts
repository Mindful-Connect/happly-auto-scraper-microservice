import {
  ExtractedOpportunityDocument,
  InterestingFields,
} from './schemas/extractedOpportunity.schema';
import * as cheerio from 'cheerio';
import axios from 'axios';
import puppeteer from 'puppeteer';
import { minify } from 'html-minifier-terser';
import { NestedStringArray } from './app.types';
import { encode } from 'gpt-3-encoder';
import { ChatGPTService } from './openai/services/chatgpt.service';
import { Field, FieldPossibleTypes } from './schemas/field.schema';
import { GPTFinishReason } from './openai/openai.types';
import { OpportunityStatusEnum } from './enums/opportunityStatus.enum';
import { getCheerioAPIFromHTML, isValidUri } from './utils/helperFunctions';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ExtractorService {
  private url: string;
  private extractedOpportunityDocument: ExtractedOpportunityDocument;
  private isNested: boolean;

  private systemMessage =
    'Given a chunk of HTML text, extract information asked by the user, and reply only in JSON format. your replies must be fully parsable by JSON.parse method in JavaScript.';

  private segmentSplittingIdentifiers: string[] = ['<h1', '<h2', '<h3', '<p', '.'];

  constructor(private chatGPTService: ChatGPTService, private eventEmitter: EventEmitter2) {}

  async extractOpportunity(
    url: string,
    extractedOpportunityDocument: ExtractedOpportunityDocument,
    isNested = false,
  ) {
    this.url = url;
    this.extractedOpportunityDocument = extractedOpportunityDocument;
    this.isNested = isNested;

    let $: cheerio.CheerioAPI;
    if (this.extractedOpportunityDocument.clientRenderedPage) {
      console.info('Client rendered page detected, using puppeteer... 📦🪄');
      const browser = await puppeteer.launch();
      const page = await browser.newPage();

      await page.goto(this.url);

      const pageHTML = await page.content();
      $ = getCheerioAPIFromHTML(pageHTML);
    } else {
      console.info('Static page detected, standard fetching... 🚛💨');
      const pageHTML = await axios.get(this.url);

      $ = getCheerioAPIFromHTML(pageHTML.data);
    }

    let stripped: string;
    try {
      stripped = await this.getStrippedBodyHTML($);
      console.info('Stripped the HTML body... 🫣 to make it shorter for ChatGPT ✨', { stripped });
    } catch (e) {
      console.error('Could not strip the HTML body... 🫣', e);
      this.eventEmitter.emit('opportunity.extraction.pool.release', extractedOpportunityDocument);
      return;
    }

    const chunks = this.segmentTheChunk(stripped, this.extractedOpportunityDocument);
    const flattened = chunks.flat(<20>Infinity).filter(c => c !== '') as string[];
    console.info('Segmented the HTML chunk into smaller chunks if necessary... 🪄🗃️', {
      flattened,
    });

    while (flattened.length > 0) {
      const readyToBeSent: string[] = [];

      while (
        flattened.length > 0 &&
        ChatGPTService.tokenLimit / 2 >=
          this.countTokens([
            this.systemMessage,
            this.getUserMessage(
              readyToBeSent.join('') + flattened[0],
              this.extractedOpportunityDocument,
            ),
          ])
      ) {
        readyToBeSent.push(flattened.shift());
      }

      console.info('Gathering chunks to be sent to ChatGPT... 🚚', { readyToBeSent });

      const userMessage = this.getUserMessage(
        readyToBeSent.join(''),
        this.extractedOpportunityDocument,
      );

      const totalMessagesToken = this.countTokens([this.systemMessage, userMessage]);

      const requestingFields = this.getRequestingFields(this.extractedOpportunityDocument);
      console.info('Deciding which missing fields to request... 🔍📦', { requestingFields });

      try {
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

        console.info('Received response from ChatGPT... ✅🧠🤖', gptResponse);

        const finishReason: GPTFinishReason = gptResponse.choices[0].finish_reason;
        if (finishReason !== GPTFinishReason.STOP) {
          console.info('ChatGPT did not finish the response... ❌🧠🤖', gptResponse);
          this.extractedOpportunityDocument.status = OpportunityStatusEnum.GPT_ERROR;
          await this.extractedOpportunityDocument.save();
          this.eventEmitter.emit(
            'opportunity.extraction.pool.release',
            this.extractedOpportunityDocument,
          );
          return;
        }

        const responseStringJson = gptResponse.choices[0].message.content;
        const response = JSON.parse(responseStringJson);

        Object.keys(response).forEach(key => {
          const value: { data: any; relevant_link: string } = response[key];
          if (requestingFields.includes(key)) {
            this.extractedOpportunityDocument.status = OpportunityStatusEnum.PARTIALLY_EXTRACTED;

            const field = this.extractedOpportunityDocument[key] as Field<FieldPossibleTypes>;
            field.data = value.data;
            field.relevantLink = isValidUri(value.relevant_link)
              ? value.relevant_link
              : field.relevantLink;
          }
        });

        // save in db
        await this.extractedOpportunityDocument.save();
        console.info('Saved the response in the database... ✅📦🗃️');
      } catch (e) {
        console.info('ChatGPT failed to respond... ❌🧠🤖', e);
        console.error(e, e.response, e.response.data);
      }
    }

    const anyOtherRequestingFields = this.getRequestingFields(extractedOpportunityDocument);

    if (!isNested) {
      const relevantLinks: { [key in string]: string[] } = {};
      anyOtherRequestingFields.forEach(fieldName => {
        const field = extractedOpportunityDocument[fieldName] as Field<FieldPossibleTypes>;
        if (isValidUri(field.relevantLink)) {
          if (relevantLinks[field.relevantLink]) {
            relevantLinks[field.relevantLink].push(fieldName);
          } else {
            relevantLinks[field.relevantLink] = [fieldName];
          }
        }
      });

      if (anyOtherRequestingFields.length === 0) {
        extractedOpportunityDocument.status = OpportunityStatusEnum.FULLY_EXTRACTED;
        await extractedOpportunityDocument.save();

        console.info('Extracted all the fields! 🥳🍾');

        // emit an event to make manager release another from queue or whatever.
        this.eventEmitter.emit('opportunity.extraction.pool.release', extractedOpportunityDocument);
      } else {
        if (Object.keys(relevantLinks).length < 1) {
          extractedOpportunityDocument.status = OpportunityStatusEnum.NEEDS_REVIEW;
          await extractedOpportunityDocument.save();

          console.info(
            'Some fields are missing but no relevant links were found! needs manual review 😓',
          );

          this.eventEmitter.emit(
            'opportunity.extraction.pool.release',
            extractedOpportunityDocument,
          );
        } else {
          extractedOpportunityDocument.status = OpportunityStatusEnum.PARTIALLY_EXTRACTED;
          await extractedOpportunityDocument.save();

          console.info('Some fields are missing but relevant links were found! (promising) 🧐🔎');

          this.eventEmitter.emit(
            'opportunity.extraction.recurseNeeded',
            relevantLinks,
            extractedOpportunityDocument,
          );
        }
      }
    } else {
      const isDoomed = anyOtherRequestingFields.every(fieldName => {
        const field = extractedOpportunityDocument[fieldName] as Field<FieldPossibleTypes>;
        return !isValidUri(field.relevantLink);
      });

      if (isDoomed) {
        console.info('Finally found all the fields after visiting a relevant URL! 🥳🍾');
        extractedOpportunityDocument.status = OpportunityStatusEnum.NEEDS_REVIEW;
        await extractedOpportunityDocument.save();
      } else {
        console.info(
          'Already nested but still missing field. Going to call it a day for this URL. 🤷',
        );
        extractedOpportunityDocument.status = OpportunityStatusEnum.FULLY_EXTRACTED;
      }

      this.eventEmitter.emit('opportunity.extraction.pool.release', extractedOpportunityDocument);
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

  private segmentTheChunk(
    htmlChunk: string,
    extractedOpportunityDocument: ExtractedOpportunityDocument,
    separatorIndex = 0,
  ): NestedStringArray {
    // should i chunk it more?
    const numOfTokens = this.countTokens([
      this.systemMessage,
      this.getUserMessage(htmlChunk, extractedOpportunityDocument),
    ]);
    if (ChatGPTService.tokenLimit / 2 < numOfTokens) {
      const nextSeparator =
        this.segmentSplittingIdentifiers.length - 1 === separatorIndex
          ? separatorIndex
          : separatorIndex + 1;
      const { success, segments } = this.segmentMethod(
        htmlChunk,
        this.segmentSplittingIdentifiers[separatorIndex],
      );
      if (success) {
        return segments.map(s =>
          this.segmentTheChunk(s, extractedOpportunityDocument, nextSeparator),
        );
      }
      if (nextSeparator === separatorIndex) {
        return [''];
      }
      return this.segmentTheChunk(htmlChunk, extractedOpportunityDocument, nextSeparator);
    } else {
      return [htmlChunk];
    }
  }
  private getUserMessage(
    chunk: string,
    extractedOpportunity: ExtractedOpportunityDocument,
    requestingFields: string[] = this.getRequestingFields(extractedOpportunity),
  ) {
    let whereClauses = '';
    let jsonString = '';
    requestingFields.forEach((fieldName, index) => {
      const field = extractedOpportunity[fieldName] as Field<FieldPossibleTypes>;
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

  private getRequestingFields(
    extractedOpportunityDocument: ExtractedOpportunityDocument,
  ): string[] {
    return InterestingFields.filter(f => {
      // return value -> false: not requesting (it's filled) - true: requesting (it's missing)
      const field = extractedOpportunityDocument[f] as Field<FieldPossibleTypes>;
      // if (isValidUrl(field.relevantLink)) {
      //   return false;
      // }
      if (field.data === null) {
        return true;
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
    _$(
      'body script, body footer, body noscript, body style, body link, body header, body svg',
    ).remove();

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
