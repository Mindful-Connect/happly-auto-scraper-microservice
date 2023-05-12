import { v4 as uuidv4 } from 'uuid';
import * as cheerio from 'cheerio';
import { minify } from 'html-minifier-terser';

/**
 * Get the current date and time in the MySQL date format in UTC.
 * Usable for the createdAt and updatedAt fields. and any other fields that
 * is going to be read by other microservices. (e.g. the admin portal, the core API)
 */
export function getMySQLDateFormatUTC() {
  // Create a new Date object
  const date = new Date();

  // Convert the Date object to UTC
  const dateUTC = new Date(date.getTime() + date.getTimezoneOffset() * 60000);

  // Format the UTC date to the MySQL date format
  const year = dateUTC.getFullYear();
  const month = ('0' + (dateUTC.getMonth() + 1)).slice(-2);
  const day = ('0' + dateUTC.getDate()).slice(-2);
  const hours = ('0' + dateUTC.getHours()).slice(-2);
  const minutes = ('0' + dateUTC.getMinutes()).slice(-2);
  const seconds = ('0' + dateUTC.getSeconds()).slice(-2);

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function normalizeDateFromString(date: string) {
  const dateObject = new Date(date);
  if (isNaN(dateObject.getTime())) {
    return null;
  }
  const year = dateObject.getFullYear();
  const month = ('0' + (dateObject.getMonth() + 1)).slice(-2);
  const day = ('0' + dateObject.getDate()).slice(-2);

  return `${year}-${month}-${day}`;
}

export function newUUID() {
  return uuidv4();
}

export function convertToKebabCase(str: string) {
  let ans = '';
  str = str.trim();
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char.trim().length === 0) {
      ans += '-';
      continue;
    }
    if (char === char.toUpperCase()) {
      ans += char.toLowerCase();
      continue;
    }
    ans += char;
  }
  return ans;
}

export function getCheerioAPIFromHTML(html: string) {
  return cheerio.load(html, {
    scriptingEnabled: false,
    xml: {
      // Disable `xmlMode` to parse HTML with htmlparser2.
      xmlMode: false,
    },
  });
}

export function isValidUri(uri: string | null) {
  return uri !== null && typeof uri === 'string' && uri.length > 0;
}

export function isValidUrl(url: string) {
  try {
    if (url.length < 1) return false;
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

export function isValidRelevantLink(link: string | null | undefined, _programURL: string) {
  try {
    const relevantLinkURL = new URL(link);
    const programURL = new URL(_programURL);

    // If the relevant link is not in the same domain as the program url, then it's valid.
    // OR, If the relevant link is in the same domain as the program url, then it's valid if the path is not the same as the program url.
    return relevantLinkURL.host !== programURL.host || (relevantLinkURL.pathname !== programURL.pathname && relevantLinkURL.pathname.length > 1);
  } catch (_) {
    // If the relevant link is not a valid URL, then it's valid if it's a valid URI.
    // differences between a URI and a URL: https://stackoverflow.com/questions/176264/what-is-the-difference-between-a-uri-a-url-and-a-urn
    return isValidUri(link);
  }
}

export function isValidDateString(date: string) {
  return !isNaN(Date.parse(date));
}

/**
 * Given a URL and a URI, it puts them together using the host of the URL and the whole URI together.
 * e.g.: appUrl = https://www.google.com/a/b/c, uri = /search?q=hello
 * expected result: https://www.google.com/search?q=hello
 * @param appUrl
 * @param uri
 */
export function reassembleUrl(appUrl: string, uri: string) {
  try {
    const url = new URL(appUrl);

    if (uri.startsWith('/')) {
      return url.origin + uri;
    } else {
      return url.origin + '/' + uri;
    }
  } catch (e) {
    return uri;
  }
}

/**
 * Same as `reassembleUrl`, but throws an error if the URL is invalid.
 * @param appUrl
 * @param uri
 */
export function tryReassembleUrl(appUrl: string, uri: string) {
  try {
    const url = new URL(appUrl);

    if (uri.startsWith('/')) {
      return url.origin + uri;
    } else {
      return url.origin + '/' + uri;
    }
  } catch (e) {
    throw new Error('Invalid URL');
  }
}

/**
 * Strips the body of the HTML document of all scripts, styles, and other unnecessary tags.
 * This is done to reduce the size of the HTML document to be sent to GPT. Hence, reducing the token count.
 * @param _$
 * @private
 */
export async function getStrippedBodyHTML(_$: cheerio.CheerioAPI) {
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
