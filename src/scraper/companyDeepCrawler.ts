import axios from 'axios';
import * as cheerio from 'cheerio';
import chalk from 'chalk';
import { extractEmailsFromHtml } from '../enrichment/emailExtractor.js';
import { getRandomUserAgent } from '../utils/userAgents.js';
import { JobListing } from '../types/index.js';

export interface CompanyCrawlResult {
  companyName: string;
  companyDomain: string;
  websiteUrl: string;
  hasActiveRole: boolean;
  job: JobListing;
  discoveredEmails: string[];
  careerPageUrl?: string;
  contactPageUrl?: string;
}

export function extractCompaniesFromListicleHtml(
  html: string,
  sourceUrl: string
): { name: string; website: string }[] {
  const $ = cheerio.load(html);
  const discovered: { name: string; website: string }[] = [];
  const seenDomains = new Set<string>();

  let sourceDomain = '';
  try {
    sourceDomain = new URL(sourceUrl).hostname.replace(/^www\./, '');
  } catch {}

  const BLOCKED_LISTICLE_WORDS = [
    'conclusion',
    'faq',
    'table of content',
    'overview',
    'introduction',
    'criteria',
    'summary',
    'benefits',
    'why choose',
    'how we chose',
    'related posts',
    'contact us',
    'leave a reply',
    'share this'
  ];

  $('h2, h3, h4, strong, li').each((_, el) => {
    const text = $(el).text().trim();
    const match = text.match(/^(?:(?:\d+|#\d+|top\s*\d+)[\.\):\s-]*)([A-Za-z0-9\s&.-]{2,35})(?:\s*[-–:|(\[]|$)/i);
    if (match && match[1]) {
      const candidateName = match[1].trim();
      const lower = candidateName.toLowerCase();

      if (
        candidateName.length > 2 &&
        candidateName.length < 35 &&
        !BLOCKED_LISTICLE_WORDS.some((w) => lower.includes(w)) &&
        !lower.includes('software house') &&
        !lower.includes('companies in')
      ) {
        let candidateWebsite = '';
        const a = $(el).find('a').length ? $(el).find('a') : $(el).next().find('a');
        const href = a.attr('href') || '';
        if (href.startsWith('http') && !href.includes(sourceDomain)) {
          try {
            const parsed = new URL(href);
            const dom = parsed.hostname.replace(/^www\./, '');
            if (!seenDomains.has(dom) && dom.includes('.')) {
              candidateWebsite = `${parsed.protocol}//${parsed.hostname}`;
              seenDomains.add(dom);
            }
          } catch {}
        }

        if (!candidateWebsite) {
          const domGuess = `${candidateName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
          if (!seenDomains.has(domGuess)) {
            candidateWebsite = `https://${domGuess}`;
            seenDomains.add(domGuess);
          }
        }

        if (candidateWebsite && !discovered.some((c) => c.name.toLowerCase() === candidateName.toLowerCase())) {
          discovered.push({
            name: candidateName,
            website: candidateWebsite
          });
        }
      }
    }
  });

  return discovered;
}

export async function crawlCompanyWebsiteAndExtractOpportunity(
  companyUrl: string
): Promise<CompanyCrawlResult | null> {
  let targetUrl = companyUrl.trim();
  if (!targetUrl.startsWith('http')) {
    targetUrl = `https://${targetUrl}`;
  }

  let domain = '';
  let companyName = 'Company';
  try {
    const parsed = new URL(targetUrl);
    domain = parsed.hostname.replace(/^www\./, '');
    const cleanDomain = domain.split('.')[0];
    companyName = cleanDomain.charAt(0).toUpperCase() + cleanDomain.slice(1);
  } catch {
    console.error(chalk.red(`Invalid company URL: ${companyUrl}`));
    return null;
  }

  console.log(chalk.bold.cyan(`\n🕷️ Deep Crawling Company: ${companyName} (${domain})...`));

  let homepageHtml = '';
  try {
    const res = await axios.get(targetUrl, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 12000,
      maxContentLength: 5 * 1024 * 1024
    });
    homepageHtml = res.data;
  } catch (err: any) {
    console.warn(chalk.yellow(`  • Failed fetching homepage (${err.message}). Using domain fallback.`));
  }

  const $ = cheerio.load(homepageHtml || '<html><body></body></html>');

  // Check if target is a listicle article (e.g. "Top 10 Software Houses in Karachi")
  const pageTitle = $('title').text().toLowerCase();
  const isListicle =
    pageTitle.includes('top 10') ||
    pageTitle.includes('top 20') ||
    pageTitle.includes('list of') ||
    pageTitle.includes('best software') ||
    pageTitle.includes('best it companies') ||
    targetUrl.includes('/top-') ||
    targetUrl.includes('/list-of-') ||
    targetUrl.includes('/best-');

  if (isListicle && homepageHtml.length > 500) {
    const unpacked = extractCompaniesFromListicleHtml(homepageHtml, targetUrl);
    if (unpacked.length > 0) {
      console.log(chalk.bold.green(`  📰 Discovered listicle article! Unpacked ${unpacked.length} real companies:`));
      unpacked.slice(0, 5).forEach((u, i) => console.log(`     ${i + 1}. ${u.name} (${u.website})`));
      // Re-crawl the top unpacked company directly
      return crawlCompanyWebsiteAndExtractOpportunity(unpacked[0].website);
    }
  }

  const homepageEmails = extractEmailsFromHtml(homepageHtml);

  // Extract real company name if og:site_name or title has it
  const ogSiteName = $('meta[property="og:site_name"]').attr('content');
  if (ogSiteName && ogSiteName.length > 2 && ogSiteName.length < 40) {
    companyName = ogSiteName.trim();
  }

  const careerLinks: string[] = [];
  const contactLinks: string[] = [];

  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().toLowerCase().trim();
    let resolvedUrl = '';
    try {
      resolvedUrl = new URL(href, targetUrl).href;
    } catch {
      return;
    }

    if (
      (href.includes('career') ||
        href.includes('job') ||
        href.includes('join') ||
        href.includes('work-with-us') ||
        href.includes('openings') ||
        text.includes('career') ||
        text.includes('jobs') ||
        text.includes('join our team') ||
        text.includes('we are hiring')) &&
      !careerLinks.includes(resolvedUrl) &&
      (resolvedUrl.includes(domain) || resolvedUrl.includes('lever.co') || resolvedUrl.includes('greenhouse.io') || resolvedUrl.includes('ashbyhq.com') || resolvedUrl.includes('workable.com'))
    ) {
      careerLinks.push(resolvedUrl);
    }

    if (
      (href.includes('contact') ||
        href.includes('about') ||
        href.includes('team') ||
        href.includes('reach-us') ||
        text.includes('contact') ||
        text.includes('about us') ||
        text.includes('get in touch')) &&
      !contactLinks.includes(resolvedUrl) &&
      resolvedUrl.includes(domain)
    ) {
      contactLinks.push(resolvedUrl);
    }
  });

  // 1. Check Career Page for Active Engineering Roles
  let activeRoleFound = false;
  let detectedJobTitle = '';
  let detectedJobDescription = '';
  let careerPageEmails: string[] = [];
  let matchingRoleUrl = careerLinks[0] || targetUrl;

  if (careerLinks.length > 0) {
    const primaryCareerUrl = careerLinks[0];
    console.log(chalk.gray(`  • Inspecting career portal: ${primaryCareerUrl}`));
    try {
      const cRes = await axios.get(primaryCareerUrl, {
        headers: { 'User-Agent': getRandomUserAgent() },
        timeout: 12000,
        maxContentLength: 5 * 1024 * 1024
      });
      const cHtml = cRes.data;
      const c$ = cheerio.load(cHtml);
      careerPageEmails = extractEmailsFromHtml(cHtml);

      // Search for tech engineering titles on the career page
      const engineeringKeywords = [
        'full stack',
        'fullstack',
        'software engineer',
        'frontend engineer',
        'frontend developer',
        'backend engineer',
        'backend developer',
        'next.js',
        'react developer',
        'platform architect',
        'ai engineer',
        'web developer',
        'tech lead'
      ];

      c$('h1, h2, h3, h4, a, li, p').each((_, el) => {
        if (activeRoleFound) return;
        const text = c$(el).text().trim();
        const lower = text.toLowerCase();

        for (const kw of engineeringKeywords) {
          if (lower.includes(kw) && text.length > 5 && text.length < 80 && !lower.includes('why') && !lower.includes('how')) {
            activeRoleFound = true;
            detectedJobTitle = text;
            detectedJobDescription = c$(el).closest('div, section, article, li').text().trim().slice(0, 1500) || text;
            const linkHref = c$(el).is('a') ? c$(el).attr('href') : c$(el).find('a').attr('href');
            if (linkHref) {
              try {
                matchingRoleUrl = new URL(linkHref, primaryCareerUrl).href;
              } catch {}
            }
            break;
          }
        }
      });
    } catch {
      // ignore
    }
  }

  // 2. Check Contact / About Page for Direct Inboxes
  let contactPageEmails: string[] = [];
  if (contactLinks.length > 0 && careerPageEmails.length === 0 && homepageEmails.length === 0) {
    try {
      const contactRes = await axios.get(contactLinks[0], {
        headers: { 'User-Agent': getRandomUserAgent() },
        timeout: 10000
      });
      contactPageEmails = extractEmailsFromHtml(contactRes.data);
    } catch {}
  }

  const allDiscoveredEmails = Array.from(
    new Set([...careerPageEmails, ...homepageEmails, ...contactPageEmails])
  );

  const nonGeneral = allDiscoveredEmails.filter(
    (e) =>
      !e.includes('investor') &&
      !e.includes('legal') &&
      !e.includes('privacy') &&
      !e.includes('dpo') &&
      !e.includes('press') &&
      !e.includes('media')
  );

  const primaryContactEmail =
    nonGeneral.find((e) => e.includes('career') || e.includes('job') || e.includes('hr') || e.includes('talent') || e.includes('recruit')) ||
    nonGeneral.find((e) => e.includes('contact') || e.includes('info') || e.includes('hi@') || e.includes('hello@') || e.includes('team@')) ||
    nonGeneral[0] ||
    `careers@${domain}`;

  // 3. Build Opportunity (Role-Tailored vs. High-Impact Speculative Master Pitch)
  if (activeRoleFound && detectedJobTitle) {
    console.log(chalk.bold.green(`  🎯 Active Role Found: "${detectedJobTitle}"`));
    console.log(chalk.gray(`     Contact Inbox: ${primaryContactEmail}`));

    const job: JobListing = {
      url: matchingRoleUrl,
      companyName,
      companyDomain: domain,
      jobTitle: detectedJobTitle,
      descriptionText: detectedJobDescription || `Full-Stack Software Engineering position at ${companyName}`,
      requirements: ['TypeScript', 'Next.js', 'Node.js', 'PostgreSQL', 'Full Stack'],
      contactEmail: primaryContactEmail
    };

    return {
      companyName,
      companyDomain: domain,
      websiteUrl: targetUrl,
      hasActiveRole: true,
      job,
      discoveredEmails: allDiscoveredEmails,
      careerPageUrl: careerLinks[0],
      contactPageUrl: contactLinks[0]
    };
  } else {
    console.log(chalk.bold.yellow(`  💡 No Specific Open Role Found -> Generating Speculative Senior Pitch & Master Resume`));
    console.log(chalk.gray(`     Contact Inbox: ${primaryContactEmail}`));

    const job: JobListing = {
      url: targetUrl,
      companyName,
      companyDomain: domain,
      jobTitle: 'Senior Software Engineer / Platform Architect (Speculative)',
      descriptionText: $('body').text().slice(0, 1000) || `Innovative software platforms and solutions at ${companyName}`,
      requirements: ['Next.js', 'TypeScript', 'Node.js', 'Architecture', 'Full Stack SaaS'],
      contactEmail: primaryContactEmail
    };

    return {
      companyName,
      companyDomain: domain,
      websiteUrl: targetUrl,
      hasActiveRole: false,
      job,
      discoveredEmails: allDiscoveredEmails,
      careerPageUrl: careerLinks[0],
      contactPageUrl: contactLinks[0]
    };
  }
}
