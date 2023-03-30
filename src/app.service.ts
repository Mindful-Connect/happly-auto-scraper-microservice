import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ExtractedOpportunity,
  ExtractedOpportunityDocument,
  InterestingFields,
} from './schemas/extractedOpportunity.schema';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { minify } from 'html-minifier-terser';
import { ChatGPTService } from './openai/services/chatgpt.service';
import { encode } from 'gpt-3-encoder';
import { GPTFinishReason } from './openai/openai.types';
import puppeteer from 'puppeteer';
import { Field, FieldPossibleTypes } from './schemas/field.schema';
import { isValidUrl } from './utils/helperFunctions';
import { OpportunityStatusEnum } from './enums/opportunityStatus.enum';

type NestedStringArray = Array<NestedStringArray | string>;

@Injectable()
export class AppService {
  private readonly extractingOpportunitiesQueue: {
    url: string;
    extractingOpportunityDocument: ExtractedOpportunityDocument;
  }[] = [];

  private systemMessage =
    'Given a chunk of HTML text, extract information asked by the user, and reply only in JSON format. your replies must be fully parsable by JSON.parse method in JavaScript.';

  private tokenLimit = 8192;

  private rateLimitTokenCounter = 0;
  private rateLimitTokenPerMinute = 40000;
  private rateLimitRequestPerMinute = 200;

  private segmentSplittingIdentifiers: string[] = ['<h1', '<h2', '<h3', '<p', '.'];

  constructor(
    @InjectModel(ExtractedOpportunity.name)
    private extractedOpportunityModel: Model<ExtractedOpportunityDocument>,
    private chatGPTService: ChatGPTService,
    private eventEmitter: EventEmitter2,
  ) {}

  private getCheerioAPIFromHTML(html: string) {
    return cheerio.load(html, {
      scriptingEnabled: false,
      xml: {
        // Disable `xmlMode` to parse HTML with htmlparser2.
        xmlMode: false,
      },
    });
  }

  async submitURL(url: string): Promise<any> {
    // imagining all the webpages are not using javascript to render.
    const pageHTML = await axios.get(url);

    let $ = this.getCheerioAPIFromHTML(pageHTML.data);
    let body = $('body');

    // check if this is a CRP page
    // TODO: maybe ask chatGPT to confirm
    const clientRenderedPage = body.html().length < 200;

    let extractedOpportunityDocument = await this.extractedOpportunityModel.findOne({ url }).exec();

    if (extractedOpportunityDocument === null) {
      extractedOpportunityDocument = new this.extractedOpportunityModel(
        new ExtractedOpportunity({
          url,
          clientRenderedPage,
        }),
      );
      await extractedOpportunityDocument.save();
    }

    // if it is CRP, ask puppeteer to extract the information and then continue
    // TODO Fix BUG: puppeteer is not working on windows
    if (clientRenderedPage) {
      const browser = await puppeteer.launch();
      const page = await browser.newPage();

      await page.goto(url);

      const pageHTML = await page.content();
      $ = this.getCheerioAPIFromHTML(pageHTML);
      body = $('body');
    }

    const stripped = await this.getStrippedBodyHTML($);

    const chunks = this.segmentTheChunk(stripped, extractedOpportunityDocument);
    const flattened = chunks.flat(<20>Infinity).filter(c => c !== '') as string[];

    while (flattened.length > 0) {
      const readyToBeSent: string[] = [];

      while (
        flattened.length > 0 &&
        this.tokenLimit / 2 >=
          this.countTokens([
            this.systemMessage,
            this.getUserMessage(
              readyToBeSent.join('') + flattened[0],
              extractedOpportunityDocument,
            ),
          ])
      ) {
        readyToBeSent.push(flattened.shift());
      }

      console.log('chunks', readyToBeSent);

      const userMessage = this.getUserMessage(readyToBeSent.join(''), extractedOpportunityDocument);

      const totalMessagesToken = this.countTokens([this.systemMessage, userMessage]);

      const requestingFields = this.getRequestingFields(extractedOpportunityDocument);

      try {
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
          temperature: 0.7,
          max_tokens: this.tokenLimit - totalMessagesToken, // completion token.
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
          n: 1,
          stream: false,
        });

        // this.rateLimitTokenCounter += gptResponse.usage.total_tokens;

        console.log('gptResponse', gptResponse);

        const finishReason: GPTFinishReason = gptResponse.choices[0].finish_reason;

        const responseStringJson = gptResponse.choices[0].message.content;
        const response = JSON.parse(responseStringJson);

        Object.keys(response).forEach(key => {
          const value: { data: any; relevant_link: string } = response[key];
          if (requestingFields.includes(key)) {
            extractedOpportunityDocument.status = OpportunityStatusEnum.PARTIALLY_EXTRACTED;

            const field = extractedOpportunityDocument[key] as Field<FieldPossibleTypes>;
            field.data = value.data;
            field.relevantLink = isValidUrl(value.relevant_link)
              ? value.relevant_link
              : field.relevantLink;
          }
        });

        // save in db
        await extractedOpportunityDocument.save();

        console.log('response', response);
      } catch (e) {
        console.error(e, e.response, e.response.data);
      }
    }

    const anyOtherRequestingFields = this.getRequestingFields(extractedOpportunityDocument);

    const relevantLinks: { [key in string]: string[] } = {};
    anyOtherRequestingFields.forEach(fieldName => {
      const field = extractedOpportunityDocument[fieldName] as Field<FieldPossibleTypes>;
      if (isValidUrl(field.relevantLink)) {
        if (relevantLinks[field.relevantLink]) {
          relevantLinks[field.relevantLink].push(fieldName);
        } else {
          relevantLinks[field.relevantLink] = [fieldName];
        }
      }
    });

    if (Object.keys(relevantLinks).length < 1) {
      extractedOpportunityDocument.status = OpportunityStatusEnum.NEEDS_REVIEW;
      await extractedOpportunityDocument.save();
      return;
    }

    // TODO: go to the relevant links and try extracting the data (one level only).
    for (const relevantLink of Object.keys(relevantLinks)) {
      const requestingFields = relevantLinks[relevantLink];

      const pageHTML = await axios.get(relevantLink);
      let $ = this.getCheerioAPIFromHTML(pageHTML.data);
      let body = $('body');

      // check if this is a CRP page
      // TODO: maybe ask chatGPT to confirm
      const clientRenderedPage = body.html().length < 200;

      // if it is CRP, ask puppeteer to extract the information and then continue
      // TODO Fix BUG: puppeteer is not working on windows
      if (clientRenderedPage) {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        await page.goto(url);

        const pageHTML = await page.content();
        $ = this.getCheerioAPIFromHTML(pageHTML);
        body = $('body');
      }

      const stripped = await this.getStrippedBodyHTML($);

      const chunks = this.segmentTheChunk(stripped, extractedOpportunityDocument);
      const flattened = chunks.flat(<20>Infinity).filter(c => c !== '') as string[];

      while (flattened.length > 0) {
        const readyToBeSent: string[] = [];

        while (
          flattened.length > 0 &&
          this.tokenLimit / 2 >=
            this.countTokens([
              this.systemMessage,
              this.getUserMessage(
                readyToBeSent.join('') + flattened[0],
                extractedOpportunityDocument,
              ),
            ])
        ) {
          readyToBeSent.push(flattened.shift());
        }

        console.log('chunks', readyToBeSent);

        const userMessage = this.getUserMessage(
          readyToBeSent.join(''),
          extractedOpportunityDocument,
        );

        const totalMessagesToken = this.countTokens([this.systemMessage, userMessage]);

        try {
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
            temperature: 0.7,
            max_tokens: this.tokenLimit - totalMessagesToken, // completion token.
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
            n: 1,
            stream: false,
          });

          // this.rateLimitTokenCounter += gptResponse.usage.total_tokens;

          console.log('gptResponse', gptResponse);

          const finishReason: GPTFinishReason = gptResponse.choices[0].finish_reason;

          const responseStringJson = gptResponse.choices[0].message.content;
          const response = JSON.parse(responseStringJson);

          Object.keys(response).forEach(key => {
            const value: { data: any; relevant_link: string } = response[key];
            if (requestingFields.includes(key)) {
              extractedOpportunityDocument.status = OpportunityStatusEnum.PARTIALLY_EXTRACTED;

              const field = extractedOpportunityDocument[key] as Field<FieldPossibleTypes>;
              field.data = value.data;
              field.relevantLink = isValidUrl(value.relevant_link)
                ? value.relevant_link
                : field.relevantLink;
            }
          });

          // save in db
          await extractedOpportunityDocument.save();

          console.log('response', response);
        } catch (e) {
          console.error(e, e.response, e.response.data);
        }
      }

      const anyOtherRequestingFields = this.getRequestingFields(extractedOpportunityDocument);

      const isDoomed = anyOtherRequestingFields.every(fieldName => {
        const field = extractedOpportunityDocument[fieldName] as Field<FieldPossibleTypes>;
        return !isValidUrl(field.relevantLink);
      });

      if (isDoomed) {
        extractedOpportunityDocument.status = OpportunityStatusEnum.NEEDS_REVIEW;
        await extractedOpportunityDocument.save();
        return;
      }
    }
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
          return data.filter(d => d !== '').length < 1;
        case 'number':
          data = field.data as number;
          return isNaN(data);
        case 'number[]':
          data = field.data as number[];
          return data.filter(d => !isNaN(d)).length < 1;
        case 'date':
          return field.data === '';
      }
    });
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
    if (this.tokenLimit / 2 < numOfTokens) {
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

  private countTokens(messages: string[]) {
    let totalTokens = 0;

    for (const message of messages) {
      totalTokens += 4; // every message follows <im_start>{role/name}\n{content}<im_end>\n
      totalTokens += encode(message).length;
    }
    totalTokens += 2; // every reply is primed with <im_start>assistant

    console.log('totalTokens', totalTokens);
    return totalTokens;
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

where \`relevant_link\` is any internal link to relevant information about the context of the JSON object property.
${whereClauses}
---
{
  ${jsonString}
}`;
  }

  private async getStrippedBodyHTML(_$: cheerio.CheerioAPI) {
    _$('body script, body footer, body noscript, body style, body link, body header').remove();

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

  async helloMicroservice(): Promise<any> {
    const opportunity = new this.extractedOpportunityModel({
      opportunity_provider_name: {
        contextSlug: 'opportunity_provider_name',
        fieldType: 'string',
      },
    });
    return await opportunity.save();
  }

  async getOpportunities(): Promise<ExtractedOpportunity[]> {
    return await this.extractedOpportunityModel.find().exec();
  }
}
