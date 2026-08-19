import axios from 'axios';
import * as cheerio from 'cheerio';
import { JobListing } from '../types/index.js';
import { extractEmailsFromHtml } from '../enrichment/emailExtractor.js';
import { findCareerPagesFromSitemap } from './sitemapParser.js';
import { launchManagedBrowser } from '../utils/browserManager.js';
import { getRandomUserAgent } from '../utils/userAgents.js';
import { applyStealthEvasions } from '../discovery/searchEngine.js';

// Render dynamic JavaScript SPA pages (React / Next.js / Vue / Workable / Lever) with Stealth
async function renderPageWithPuppeteer(url: string): Promise<string> {
  let browser;
  try {
    browser = await launchManagedBrowser({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1366,768'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(getRandomUserAgent());
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'upgrade-insecure-requests': '1'
    });
    await applyStealthEvasions(page);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    // Wait for client-side JS hydration (Workable, Lever, React SPAs)
    await new Promise((r) => setTimeout(r, 2000));

    return await page.content();
  } catch (err: any) {
    console.warn(`[SPA Scraper] Headless rendering warning for ${url}: ${err.message}`);
    return '';
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

function resolveCompanyFromAts(
  url: string,
  domain: string,
  defaultName: string
): { companyName: string; companyDomain: string } {
  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname;

    // 1. Lever: jobs.lever.co/{company}/...
    if (host.includes('jobs.lever.co')) {
      const slug = pathname.split('/')[1];
      if (slug && slug.length > 1) {
        const name = slug.charAt(0).toUpperCase() + slug.slice(1);
        return { companyName: name, companyDomain: `${slug}.com` };
      }
    }

    // 2. Greenhouse: boards.greenhouse.io/{company}/...
    if (host.includes('boards.greenhouse.io') || host.includes('greenhouse.io')) {
      const slug = pathname.split('/')[1];
      if (slug && slug.length > 1) {
        const name = slug.charAt(0).toUpperCase() + slug.slice(1);
        return { companyName: name, companyDomain: `${slug}.com` };
      }
    }

    // 3. Ashby: jobs.ashbyhq.com/{company}/...
    if (host.includes('ashbyhq.com')) {
      const slug = pathname.split('/')[1];
      if (slug && slug.length > 1) {
        const name = slug.charAt(0).toUpperCase() + slug.slice(1);
        return { companyName: name, companyDomain: `${slug}.com` };
      }
    }

    // 4. Workable: apply.workable.com/{company}/j/... or jobs.workable.com/view/.../at-{company}
    if (host.includes('workable.com')) {
      if (host.includes('apply.workable.com')) {
        const slug = pathname.split('/')[1];
        if (slug && slug.length > 1) {
          const name = slug.charAt(0).toUpperCase() + slug.slice(1);
          return { companyName: name, companyDomain: `${slug}.com` };
        }
      }
      const atMatch = pathname.match(/at-([a-zA-Z0-9_-]+)/i);
      if (atMatch && atMatch[1]) {
        const slug = atMatch[1];
        const name = slug.charAt(0).toUpperCase() + slug.slice(1);
        return { companyName: name, companyDomain: `${slug}.com` };
      }
    }

    // 5. Arbeitnow: arbeitnow.com/jobs/companies/{company}/...
    if (host.includes('arbeitnow.com')) {
      const match = pathname.match(/\/jobs\/companies\/([^/]+)/);
      if (match && match[1]) {
        const slug = match[1];
        const name = slug.charAt(0).toUpperCase() + slug.slice(1);
        return { companyName: name, companyDomain: `${slug}.com` };
      }
    }

    // 6. Subdomain-based ATS (Breezy, SmartRecruiters, ApplyToJob)
    if (
      host.includes('.breezy.hr') ||
      host.includes('.smartrecruiters.com') ||
      host.includes('.applytojob.com')
    ) {
      const sub = host.split('.')[0];
      if (sub && sub !== 'www' && sub !== 'jobs') {
        const name = sub.charAt(0).toUpperCase() + sub.slice(1);
        return { companyName: name, companyDomain: `${sub}.com` };
      }
    }
  } catch {
    // fallback
  }

  // Fallback guard: never treat job boards as the employer
  if (domain === 'arbeitnow.com' || domain === 'remotive.com' || domain === 'workable.com') {
    return { companyName: defaultName, companyDomain: `${defaultName.toLowerCase().replace(/\s+/g, '')}.com` };
  }

  return { companyName: defaultName, companyDomain: domain };
}

export async function scrapeJobOrCareerPage(targetUrl: string): Promise<JobListing[]> {
  let url = targetUrl.trim();
  // Normalize Workable duplicate apply paths (e.g. /apply/ at the end)
  if (url.endsWith('/apply/')) {
    url = url.slice(0, -6);
  } else if (url.endsWith('/apply')) {
    url = url.slice(0, -5);
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  const parsedUrl = new URL(url);
  const domain = parsedUrl.hostname.replace(/^www\./, '');
  const companyNameFromDomain = domain.split('.')[0];
  const formattedCompany =
    companyNameFromDomain.charAt(0).toUpperCase() + companyNameFromDomain.slice(1);

  let html: string = '';

  // 1. Try fast axios fetch first
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await axios.get(url, {
        timeout: 8000,
        maxContentLength: 5 * 1024 * 1024,
        maxBodyLength: 5 * 1024 * 1024,
        headers: {
          'User-Agent': getRandomUserAgent(),
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      if (response && response.data && typeof response.data === 'string') {
        if (
          !response.data.includes('Just a moment...') &&
          !response.data.includes('Attention Required!') &&
          response.data.length > 500
        ) {
          html = response.data;
          break;
        }
      }
    } catch {
      // Axios failed or was 403, fallback to Stealth Puppeteer
    }
  }

  // 2. Stealth Puppeteer Rendering: Render JS-heavy SPAs and bypass Cloudflare Turnstiles
  if (!html || html.length < 500) {
    const renderedHtml = await renderPageWithPuppeteer(url);
    if (renderedHtml && !renderedHtml.includes('Attention Required! | Cloudflare')) {
      html = renderedHtml;
    }
  }

  if (!html) {
    throw new Error(`Failed to retrieve page content from ${url}`);
  }

  try {
    const $ = cheerio.load(html);

    // Check schema.org JobPosting JSON-LD (cleanest structure on Workable, Greenhouse, Ashby)
    let jsonLdJob: any = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const jsonText = $(el).html();
        if (jsonText) {
          const parsed = JSON.parse(jsonText);
          if (parsed['@type'] === 'JobPosting') {
            jsonLdJob = parsed;
          }
        }
      } catch {}
    });

    // Check for company official website link in page (e.g. [View website](https://acquisity.ai))
    let companyWebsiteDomain = '';
    $('a').each((_, el) => {
      const text = $(el).text().toLowerCase();
      const href = $(el).attr('href') || '';
      if (
        (text.includes('website') || text.includes('company')) &&
        href.startsWith('http') &&
        !href.includes('workable.com') &&
        !href.includes('greenhouse.io') &&
        !href.includes('lever.co') &&
        !href.includes('ashbyhq.com')
      ) {
        try {
          companyWebsiteDomain = new URL(href).hostname.replace(/^www\./, '');
        } catch {}
      }
    });

    $('script, style, noscript, nav, footer, svg, header').remove();

    const foundEmails = extractEmailsFromHtml(html);
    const primaryContactEmail = foundEmails.length > 0 ? foundEmails[0] : undefined;

    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

    // Advanced ATS & Meta parsing for Real Company Name & Domain
    let { companyName: smartCompanyName, companyDomain: smartCompanyDomain } =
      resolveCompanyFromAts(url, domain, formattedCompany);

    const EXCLUDED_PORTAL_NAMES = [
      'greenhouse',
      'lever',
      'ashby',
      'workable',
      'arbeitnow',
      'remotive',
      'jobicy',
      'smartrecruiters',
      'breezy',
      'applytojob'
    ];

    const ogSiteName = $('meta[property="og:site_name"]').attr('content');
    if (
      ogSiteName &&
      ogSiteName.length > 2 &&
      ogSiteName.length < 40 &&
      !EXCLUDED_PORTAL_NAMES.some((p) => ogSiteName.toLowerCase().includes(p))
    ) {
      smartCompanyName = ogSiteName.trim();
    }

    if (jsonLdJob?.hiringOrganization?.name) {
      smartCompanyName = jsonLdJob.hiringOrganization.name.trim();
      if (!companyWebsiteDomain) {
        smartCompanyDomain = `${smartCompanyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
      }
    }

    if (companyWebsiteDomain) {
      smartCompanyDomain = companyWebsiteDomain;
    }

    // Title resolution
    let smartTitle = jsonLdJob?.title || $('h1').first().text().trim() || $('title').text().trim();
    smartTitle = smartTitle.replace(/\s+[-|]\s+.*$/, '').replace(/\(Req.*?\)/i, '').trim();
    if (smartTitle.length > 60) smartTitle = smartTitle.slice(0, 57) + '...';
    if (!smartTitle) smartTitle = 'Software Engineer';

    // Direct Job URL Check: If the URL is already a direct job posting (contains /j/, /jobs/, /job/, or has JobPosting JSON-LD)
    const isDirectJobUrl =
      jsonLdJob !== null ||
      url.includes('/j/') ||
      url.includes('/view/') ||
      (url.includes('/jobs/') && url.split('/jobs/')[1]?.length > 2) ||
      (url.includes('/job/') && url.split('/job/')[1]?.length > 2) ||
      bodyText.length > 250;

    if (isDirectJobUrl) {
      const reqs: string[] = [];
      $('ul li, ol li').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 15 && text.length < 300) {
          reqs.push(text);
        }
      });

      const cleanDescription = (jsonLdJob?.description || bodyText)
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      return [
        {
          url,
          companyName: smartCompanyName,
          companyDomain: smartCompanyDomain,
          jobTitle: smartTitle,
          descriptionText: cleanDescription.slice(0, 5000),
          requirements: reqs.slice(0, 15),
          contactEmail: primaryContactEmail
        }
      ];
    }

    // Multi-job landing page fallback
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
            href.includes('/j/') ||
            href.includes('/career/')) &&
          absoluteHref.startsWith('http') &&
          !absoluteHref.includes('jobseekers.workable.com') &&
          !absoluteHref.includes('utm_campaign=careers_page')
        ) {
          jobLinks.push(absoluteHref);
        }
      }
    });

    const results: JobListing[] = [];
    const uniqueJobLinks = Array.from(new Set(jobLinks)).slice(0, 5);

    if (uniqueJobLinks.length > 0) {
      for (const jLink of uniqueJobLinks) {
        try {
          const subHtml = await renderPageWithPuppeteer(jLink);
          if (!subHtml) continue;

          const sub$ = cheerio.load(subHtml);
          sub$('script, style, noscript, nav, footer, svg, header').remove();
          const subTitle = sub$('h1').first().text().trim() || sub$('title').text().trim();
          const subBody = sub$('body').text().replace(/\s+/g, ' ').trim();
          const subEmails = extractEmailsFromHtml(subHtml);

          const subReqs: string[] = [];
          sub$('ul li, ol li').each((_, el) => {
            const text = sub$(el).text().trim();
            if (text.length > 15 && text.length < 300) {
              subReqs.push(text);
            }
          });

          let subSmartTitle = subTitle.replace(/\s+[-|]\s+.*$/, '').replace(/\(Req.*?\)/i, '').trim();
          if (subSmartTitle.length > 60) subSmartTitle = subSmartTitle.slice(0, 57) + '...';
          if (!subSmartTitle) subSmartTitle = 'Software Engineer';

          const resolvedSub = resolveCompanyFromAts(jLink, domain, smartCompanyName);

          results.push({
            url: jLink,
            companyName: resolvedSub.companyName,
            companyDomain: resolvedSub.companyDomain,
            jobTitle: subSmartTitle,
            descriptionText: subBody.slice(0, 5000),
            requirements: subReqs.slice(0, 15),
            contactEmail: subEmails[0] || primaryContactEmail
          });
        } catch (err: any) {
          console.warn(`[Scraper] Could not scrape sub-page ${jLink}: ${err.message}`);
        }
      }
    }

    if (results.length > 0) return results;

    return [
      {
        url,
        companyName: smartCompanyName,
        companyDomain: smartCompanyDomain,
        jobTitle: smartTitle,
        descriptionText: bodyText.slice(0, 5000),
        requirements: [],
        contactEmail: primaryContactEmail
      }
    ];
  } catch (error: any) {
    throw new Error(`Failed to scrape ${url}: ${error.message}`);
  }
}
