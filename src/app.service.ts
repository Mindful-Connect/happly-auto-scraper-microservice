import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ExtractedOpportunity,
  ExtractedOpportunityDocument,
} from './schemas/extractedOpportunity.schema';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { minify } from 'html-minifier-terser';
import { ChatGPTService } from './openai/services/chatgpt.service';
import { encode, decode } from 'gpt-3-encoder';
import { Opportunity } from './schemas/opportunity.schema';
import { GPTFinishReason } from './openai/openai.types';

@Injectable()
export class AppService {
  private readonly opportunitiesQueue: ExtractedOpportunity[] = [];

  private systemMessage =
    'Given a chunk of HTML text, extract information asked by the user, and reply only in JSON format. your replies must be fully parsable by JSON.parse method in JavaScript.';

  private tokenLimit = 8192;

  private rateLimitTokenCounter = 0;
  private rateLimitTokenPerMinute = 40000;
  private rateLimitRequestPerMinute = 200;

  constructor(
    @InjectModel(ExtractedOpportunity.name)
    private extractedOpportunityModel: Model<ExtractedOpportunityDocument>,
    @InjectModel(Opportunity.name)
    private opportunityModel: Model<Opportunity>,
    private chatGPTService: ChatGPTService,
    private eventEmitter: EventEmitter2,
  ) {}

  async submitURL(url: string): Promise<any> {
    // imagining all the webpages are not using javascript to render.
    const pageHTML = await axios.get(url);
    const $ = cheerio.load(pageHTML.data, {
      scriptingEnabled: false,
      xml: {
        // Disable `xmlMode` to parse HTML with htmlparser2.
        xmlMode: false,
      },
    });
    const body = $('body');

    body.find('footer').remove();
    body.find('script').remove();
    body.find('noscript').remove();
    body.find('style').remove();
    body.find('link').remove();
    body.find('header').remove();

    const strippedBody = await minify(body.html(), {
      collapseWhitespace: true,
      removeComments: true,
      removeEmptyElements: true,
      removeEmptyAttributes: true,
      removeOptionalTags: true,
      removeRedundantAttributes: true,
    });

    const strippedBody$ = cheerio.load(strippedBody, {}, false);

    strippedBody$('*').each(function (i, elem) {
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

    strippedBody$('div, section, table, aside').each((index, element) => {
      if (!element.childNodes.find((c) => c.type === 'text')) {
        $(element).unwrap();
        if (element.children.length === 0) {
          $(element).remove();
        } else {
          $(element).children().unwrap();
        }
      }
      if (['div', 'section', 'table'].includes(element.tagName)) {
        console.log(
          'childNodes[0].type',
          element.childNodes.map((c) => c?.type ?? ''),
          'tagName',
          element.tagName,
          !element.childNodes.find((c) => c.type === 'text'),
          element.children.length,
        );
      }
    });

    console.log(strippedBody$.html());

    const stripped = strippedBody$.html();

    const segmentingMethods = {
      '<h1': (htmlChunk) => {
        const segments = htmlChunk.split('<h1');
        let success = true;
        if (segments.length === 1) {
          success = false;
        }
        return { success, segments: segments.reverse() };
      },
      '<h2': (htmlChunk) => {
        const segments = htmlChunk.split('<h2');
        let success = true;
        if (segments.length === 1) {
          success = false;
        }
        return { success, segments };
      },
      '<h3': (htmlChunk) => {
        const segments = htmlChunk.split('<h3');
        let success = true;
        if (segments.length === 1) {
          success = false;
        }
        return { success, segments };
      },
      '<p': (htmlChunk) => {
        const segments = htmlChunk.split('<p');
        let success = true;
        if (segments.length === 1) {
          success = false;
        }
        return { success, segments };
      },
    };

    const getNextSeparator = (separatorIndex = 0) => {
      return Object.keys(segmentingMethods).length - 1 === separatorIndex
        ? separatorIndex
        : separatorIndex + 1;
    };

    const segmentTheChunk = (
      htmlChunk,
      separatorIndex = 0,
    ): string[] | string => {
      console.log(
        'separatorIndex',
        separatorIndex,
        'htmlChunk',
        htmlChunk.slice(0, 100),
      );
      // should i chunk it more?
      const numOfTokens = this.countTokens([
        this.systemMessage,
        this.getUserMessage(htmlChunk),
      ]);
      if (this.tokenLimit / 2 < numOfTokens) {
        const nextSeparator = getNextSeparator(separatorIndex);
        const { success, segments } =
          Object.values(segmentingMethods)[separatorIndex](htmlChunk);
        if (success) {
          return segments.map((s) => segmentTheChunk(s, nextSeparator));
        }
        if (nextSeparator === separatorIndex) {
          return '';
        }
        return segmentTheChunk(htmlChunk, nextSeparator);
      } else {
        return htmlChunk;
      }
    };

    const readyToBeSent: string[] = [];

    const chunks = segmentTheChunk(stripped);
    if (typeof chunks === 'string') {
      readyToBeSent.push(chunks);
    } else {
      const flattened = chunks.flat(Infinity).filter((c) => c !== '');
      while (
        flattened.length > 0 &&
        this.tokenLimit / 2 >=
          this.countTokens([
            this.systemMessage,
            this.getUserMessage(readyToBeSent.join('') + flattened[0]),
          ])
      ) {
        readyToBeSent.push(flattened.shift());
      }
    }

    console.log('chunks', readyToBeSent);

    const totalMessagesToken = this.countTokens([
      this.systemMessage,
      this.getUserMessage(readyToBeSent.join('')),
    ]);

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
            content: this.getUserMessage(readyToBeSent.join('')),
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

      console.log('gptResponse', gptResponse);

      const finishReason: GPTFinishReason =
        gptResponse.choices[0].finish_reason;

      const responseStringJson = gptResponse.choices[0].message.content;
      const response = JSON.parse(responseStringJson);

      // TODO: add to db

      console.log('response', response);
    } catch (e) {
      console.error(e, e.response, e.response.data);
    }

    return;

    const newOpportunity = new ExtractedOpportunity();

    console.log(newOpportunity);

    const opportunityDocument = new this.extractedOpportunityModel(
      newOpportunity,
    );

    console.log(opportunityDocument);

    // await opportunityDocument.save();
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

  private getUserMessage(chunk: string) {
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
where \`opportunitys_grant_types\` is an array of strings, phrasing what types of grants this opportunity gives the applicants.
where \`application_process_type\` is an array of all the possible ways to apply for this program. Possible values are: "online form", "contacting representatives", or "email submission"
---
{
  "opportunity_provider_name": Value<string>,
  "opportunity_issuer_name": Value<string>,
  "program_name": Value<string>,
  "application_opening_date": Value<Date>,
  "application_deadline": Value<Date>,
  "opportunity_value_proposition": Value<string[]>,
  "opportunitys_grant_types": Value<string[]>,
  "eligibility_requirements": Value<string[]>,
  "application_country": Value<string>,
  "province": Value<string>,
  "municipality": Value<string>,
  "company_size_requirements": Value<number[]>,
  "company_revenue_requirements": Value<string>,
  "company_reporting_requirements": Value<string[]>,
  "industry": Value<string>,
  "funding_amounts": Value<number[]>,
  "application_process_type": Value<string[]>
}`;
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

  async getSubmittedOpportunities(): Promise<Opportunity[]> {
    return await this.opportunityModel.find().exec();
  }
}
