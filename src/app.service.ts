import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ExtractedOpportunity,
  ExtractedOpportunityDocument,
} from './schemas/extractedOpportunitySchema';
import { Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { newUUID } from './utils/helperFunctions';
import { Field } from './schemas/field.schema';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { minify } from 'html-minifier-terser';
import { ChatGPTService } from './openai/services/chatgpt.service';
import { encode, decode } from 'gpt-3-encoder';

@Injectable()
export class AppService {
  private readonly opportunitiesQueue: ExtractedOpportunity[] = [];

  constructor(
    @InjectModel(ExtractedOpportunity.name)
    private opportunityModel: Model<ExtractedOpportunityDocument>,
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

    strippedBody$('div, table').each((index, element) => {
      if (!element.childNodes.find((c) => c.type === 'text')) {
        // console.log(element.children);
        $(element).unwrap();
      }
      console.log(
        'childNodes[0].type',
        element.childNodes.map((c) => c?.type ?? ''),
        'tagName',
        element.tagName,
      );
    });

    console.log(strippedBody$.html());

    const readyForExtraction = strippedBody$.html();

    const chunks = readyForExtraction.split('<h1');

    // const encoded = encode(readyForExtraction);
    //
    // console.log('Encoded this string looks like: ', encoded);
    //
    // console.log('We can look at each token and what it represents');
    // for (const token of encoded) {
    //   console.log({ token, string: decode([token]) });
    // }

    return;

    try {
      const gptResponse = await this.chatGPTService.getResponse({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content:
              'Given a chunk of HTML text, extract information asked by the user, and reply only in JSON format. your replies must be fully parsable by JSON.parse method in JavaScript.',
          },
          {
            role: 'user',
            content: `Your replies must be only JSON. Extract from this chunk:

${readyForExtraction}
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
}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 8000,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        n: 1,
        stream: false,
      });

      console.log('gptResponse', gptResponse);
    } catch (e) {
      console.error(e, e.response, e.response.data);
    }

    const newOpportunity = new ExtractedOpportunity();

    console.log(newOpportunity);

    const opportunityDocument = new this.opportunityModel(newOpportunity);

    console.log(opportunityDocument);

    // await opportunityDocument.save();
  }

  async helloMicroservice(): Promise<any> {
    const opportunity = new this.opportunityModel({
      opportunity_provider_name: {
        contextSlug: 'opportunity_provider_name',
        fieldType: 'string',
      },
    });
    return await opportunity.save();
  }

  async getOpportunities(): Promise<ExtractedOpportunity[]> {
    return await this.opportunityModel.find().exec();
  }
}
