import axios from 'axios';
import * as cheerio from 'cheerio';
import { JobListing } from '../types/index.js';
import { extractEmailsFromHtml } from '../enrichment/emailExtractor.js';
import { findCareerPagesFromSitemap } from './sitemapParser.js';

export async function scrapeJobOrCareerPage(targetUrl: string): Promise<JobListing[]> {
  let url = targetUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  const parsedUrl = new URL(url);
  const domain = parsedUrl.hostname.replace(/^www\./, '');
  const companyNameFromDomain = domain.split('.')[0];
  const formattedCompany =
    companyNameFromDomain.charAt(0).toUpperCase() + companyNameFromDomain.slice(1);

  let response: any = null;
  let lastError: any = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = await axios.get(url, {
        timeout: 12000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      if (response && response.data) break;
    } catch (err: any) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  if (!response || !response.data) {
    throw new Error(`Failed to scrape ${url}: ${lastError?.message || 'Network error'}`);
  }

  try {
    const html = response.data;
    const $ = cheerio.load(html);

    // Remove script, style, svg to keep clean text
    $('script, style, noscript, nav, footer, svg, header').remove();

    // 1. Extract contact emails from page
    const foundEmails = extractEmailsFromHtml(html);
    const primaryContactEmail = foundEmails.length > 0 ? foundEmails[0] : undefined;

    // 2. Determine if this page is a single Job Description (JD) or a Career listing index
    const pageTitle = $('h1').first().text().trim() || $('title').text().trim();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

    // Check for specific job indicators (Requirements, Qualifications, About the role)
    const isSingleJobPage =
      /requirements|qualifications|responsibilities|about the role|what you'll do|skills needed/i.test(
        bodyText
      ) && bodyText.length > 300;

    if (isSingleJobPage) {
      // Extract structured requirements bullet points if present
      const reqs: string[] = [];
      $('ul li, ol li').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 15 && text.length < 300) {
          reqs.push(text);
        }
      });

      return [
        {
          url,
          companyName: formattedCompany,
          companyDomain: domain,
          jobTitle: pageTitle.replace(/[-|].*$/, '').trim() || 'Software Engineer',
          descriptionText: bodyText.slice(0, 5000),
          requirements: reqs.slice(0, 15),
          contactEmail: primaryContactEmail
        }
      ];
    }

    // 3. If it's a career directory / listing page, look for individual job links or sitemap
    const jobLinks: string[] = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().toLowerCase();
      if (href) {
        let absoluteHref = href;
        if (href.startsWith('/')) {
          absoluteHref = `${parsedUrl.origin}${href}`;
        }
        if (
          (text.includes('engineer') ||
            text.includes('developer') ||
            text.includes('full stack') ||
            text.includes('frontend') ||
            text.includes('backend') ||
            href.includes('/job/') ||
            href.includes('/position/') ||
            href.includes('/career/')) &&
          absoluteHref.startsWith('http')
        ) {
          jobLinks.push(absoluteHref);
        }
      }
    });

    // If no direct job links found on page, try sitemap
    if (jobLinks.length === 0) {
      const sitemapLinks = await findCareerPagesFromSitemap(url);
      for (const sUrl of sitemapLinks) {
        if (sUrl !== url) jobLinks.push(sUrl);
      }
    }

    const results: JobListing[] = [];
    const uniqueJobLinks = Array.from(new Set(jobLinks)).slice(0, 5);

    if (uniqueJobLinks.length > 0) {
      for (const jLink of uniqueJobLinks) {
        try {
          const subRes = await axios.get(jLink, {
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          const sub$ = cheerio.load(subRes.data);
          sub$('script, style, noscript, nav, footer, svg, header').remove();
          const subTitle = sub$('h1').first().text().trim() || sub$('title').text().trim();
          const subBody = sub$('body').text().replace(/\s+/g, ' ').trim();
          const subEmails = extractEmailsFromHtml(subRes.data);

          const subReqs: string[] = [];
          sub$('ul li, ol li').each((_, el) => {
            const text = sub$(el).text().trim();
            if (text.length > 15 && text.length < 300) {
              subReqs.push(text);
            }
          });

          results.push({
            url: jLink,
            companyName: formattedCompany,
            companyDomain: domain,
            jobTitle: subTitle.replace(/[-|].*$/, '').trim() || 'Software Engineer',
            descriptionText: subBody.slice(0, 5000),
            requirements: subReqs.slice(0, 15),
            contactEmail: subEmails[0] || primaryContactEmail
          });
        } catch {
          // skip failed sub-page
        }
      }
    }

    if (results.length > 0) {
      return results;
    }

    // Fallback: Return the scraped page as generic target
    return [
      {
        url,
        companyName: formattedCompany,
        companyDomain: domain,
        jobTitle: pageTitle.replace(/[-|].*$/, '').trim() || 'Software Engineer',
        descriptionText: bodyText.slice(0, 5000),
        requirements: [],
        contactEmail: primaryContactEmail
      }
    ];
  } catch (error: any) {
    throw new Error(`Failed to scrape ${url}: ${error.message}`);
  }
}
