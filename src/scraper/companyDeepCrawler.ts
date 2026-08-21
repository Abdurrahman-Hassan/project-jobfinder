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
    'share this',
    'comments',
    'posted by',
    'written by',
    'author',
    'min read',
    'share on',
    'facebook',
    'twitter',
    'pinterest',
    'whatsapp',
    'tell us your',
    'meet top',
    'interview and hire',
    'how it works',
    'get started',
    'sign up',
    'hire developers',
    'hire talent'
  ];

  // Target main article content headings first to avoid sidebar/comment timestamps
  const targetElements = $('article h2, article h3, article h4, .entry-content h2, .entry-content h3, .post-content h2, .post-content h3, main h2, main h3');
  const elementsToScan = targetElements.length > 0 ? targetElements : $('h2, h3, h4, strong');

  elementsToScan.each((_, el) => {
    const text = $(el).text().trim();

    // Reject timestamps, dates, and comment times (e.g. "4:30 pm", "12:57 AM", "August 2026", "2 mins ago")
    if (
      /\b\d{1,2}:\d{2}\s*(?:am|pm)\b/i.test(text) ||
      /^\d+\s*(?:am|pm)$/i.test(text) ||
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text) ||
      /\b(?:minutes?|hours?|days?|ago)\b/i.test(text)
    ) {
      return;
    }

    const match = text.match(/^(?:(?:\d+|#\d+|top\s*\d+)[\.\):\s-]*)([A-Za-z0-9\s&.-]{2,35})(?:\s*[-–:|(\[]|$)/i);
    if (match && match[1]) {
      let candidateName = match[1].trim();

      // Clean trailing punctuation or qualifiers
      candidateName = candidateName.replace(/[-–:|(\[].*$/, '').trim();
      const lower = candidateName.toLowerCase();

      if (
        candidateName.length >= 3 &&
        candidateName.length < 35 &&
        !/^\d+$/.test(candidateName) &&
        !/^\d+\s*(?:am|pm)$/i.test(candidateName) &&
        !BLOCKED_LISTICLE_WORDS.some((w) => lower.includes(w)) &&
        !lower.includes('software house') &&
        !lower.includes('companies in') &&
        !lower.includes('updated') &&
        !lower.includes('rating')
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
          if (!seenDomains.has(domGuess) && !domGuess.startsWith('pm') && !domGuess.startsWith('am')) {
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

  // Check if target is a listicle article (e.g. "Top 10 Software Houses in Karachi", "Top 15 Software Houses in Islamabad")
  const pageTitle = $('title').text().toLowerCase();
  const isListicle =
    /top\s*\d+/i.test(pageTitle) ||
    /list\s*of/i.test(pageTitle) ||
    /\d+\s*best/i.test(pageTitle) ||
    /best\s*software/i.test(pageTitle) ||
    /best\s*it\s*companies/i.test(pageTitle) ||
    /\/top-|\/list-of-|\/best-/i.test(targetUrl) ||
    domain.includes('blog') ||
    domain.includes('techmag');

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

      // If specific job page URL was found, deep-crawl the exact job description & ATS requirements
      if (activeRoleFound && matchingRoleUrl && matchingRoleUrl !== primaryCareerUrl) {
        try {
          const roleRes = await axios.get(matchingRoleUrl, {
            headers: { 'User-Agent': getRandomUserAgent() },
            timeout: 10000,
            maxContentLength: 5 * 1024 * 1024
          });
          const role$ = cheerio.load(roleRes.data);
          const fullDesc = role$('main, article, div#content, .job-description, .posting-requirements, body').text().trim().slice(0, 3000);
          if (fullDesc && fullDesc.length > detectedJobDescription.length) {
            detectedJobDescription = fullDesc;
          }
          const roleEmails = extractEmailsFromHtml(roleRes.data);
          if (roleEmails.length > 0) {
            careerPageEmails.push(...roleEmails);
          }
        } catch {}
      }
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

  // 3. Adaptive Qualification: Active Role vs. Speculative Tech Pitch
  let allEmails = [...careerPageEmails, ...homepageEmails, ...contactPageEmails];

  // Discard generic non-inbox patterns, template placeholders, and unwanted system addresses
  allEmails = allEmails.filter(
    (e) =>
      !e.includes('example.com') &&
      !e.includes('sentry.io') &&
      !e.includes('wixpress.com') &&
      !e.includes('domain.com') &&
      !e.includes('company.com') &&
      !e.includes('mycompany.com') &&
      !e.startsWith('you@') &&
      !e.startsWith('user@') &&
      !e.startsWith('name@') &&
      !e.startsWith('email@') &&
      !e.startsWith('test@') &&
      !e.startsWith('sample@') &&
      !e.startsWith('noreply@') &&
      !e.startsWith('no-reply@') &&
      !e.startsWith('legal@') &&
      !e.startsWith('privacy@') &&
      !e.startsWith('investor@') &&
      !e.startsWith('press@') &&
      !e.startsWith('abuse@')
  );

  let targetRecipientEmail = '';
  if (allEmails.length > 0) {
    const hiringPriority = allEmails.find((e) =>
      /career|job|hr|talent|hiring|recruit|founder|ceo|cto|engineering|tech|team|hello|hi|info|contact/i.test(e)
    );
    targetRecipientEmail = hiringPriority || allEmails[0];
  } else {
    const { verifyDomainHasMx } = await import('../enrichment/emailExtractor.js');
    const hasMx = await verifyDomainHasMx(domain);
    if (hasMx) {
      targetRecipientEmail = `hello@${domain}`;
    } else {
      console.log(chalk.gray(`  • [DNS Guard] Domain "${domain}" has no MX mail servers. Skipping unroutable target.`));
      return null;
    }
  }

  // 4. Intelligent Site Nature Classification
  // If no active engineering role is listed, verify if company is actually a tech/software business
  if (!activeRoleFound) {
    const metaDesc = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
    const fullTextSample = `${pageTitle} ${metaDesc} ${$('body').text().slice(0, 4000)}`.toLowerCase();

    const techSignals = [
      'software development',
      'web development',
      'mobile app',
      'custom software',
      'saas',
      'digital agency',
      'it services',
      'it consulting',
      'cloud solutions',
      'ui/ux design',
      'full stack',
      'technology solutions',
      'software house',
      'engineering team',
      'api development',
      'devops'
    ];

    const nonTechMediaSignals = [
      'breaking news',
      'latest news headlines',
      'newspaper',
      'editorial',
      'horoscope',
      'weather forecast',
      'entertainment news',
      'sports news',
      'politics news',
      'daily news'
    ];

    const techScore = techSignals.filter((s) => fullTextSample.includes(s)).length;
    const mediaScore = nonTechMediaSignals.filter((s) => fullTextSample.includes(s)).length;

    const isNonTechMedia = mediaScore >= 2 && mediaScore > techScore;

    if (isNonTechMedia) {
      console.log(chalk.yellow(`  ⏭️  Skipping speculative pitch: "${companyName}" is a general news/media site with no active engineering openings.`));
      return null;
    }
  }

  // 3. Build Opportunity (Role-Tailored vs. High-Impact Speculative Master Pitch)
  if (activeRoleFound && detectedJobTitle) {
    console.log(chalk.bold.green(`  🎯 Active Role Found: "${detectedJobTitle}"`));
    console.log(chalk.green(`     Contact Inbox: ${chalk.bold(targetRecipientEmail)}`));

    const job: JobListing = {
      url: matchingRoleUrl,
      companyName,
      companyDomain: domain,
      jobTitle: detectedJobTitle,
      descriptionText: detectedJobDescription || `Full-Stack Software Engineering position at ${companyName}`,
      requirements: ['TypeScript', 'Next.js', 'Node.js', 'PostgreSQL', 'Full Stack'],
      contactEmail: targetRecipientEmail
    };

    return {
      companyName,
      companyDomain: domain,
      websiteUrl: targetUrl,
      hasActiveRole: true,
      job,
      discoveredEmails: allEmails,
      careerPageUrl: careerLinks[0],
      contactPageUrl: contactLinks[0]
    };
  } else {
    console.log(chalk.bold.cyan(`  💡 No Specific Open Role Found -> Generating Speculative Senior Pitch & Master Resume`));
    console.log(chalk.cyan(`     Contact Inbox: ${chalk.bold(targetRecipientEmail)}`));

    const job: JobListing = {
      url: targetUrl,
      companyName,
      companyDomain: domain,
      jobTitle: 'Senior Software Engineer / Platform Architect (Speculative)',
      descriptionText: $('body').text().slice(0, 1000) || `Innovative software platforms and solutions at ${companyName}`,
      requirements: ['Next.js', 'TypeScript', 'Node.js', 'Architecture', 'Full Stack SaaS'],
      contactEmail: targetRecipientEmail
    };

    return {
      companyName,
      companyDomain: domain,
      websiteUrl: targetUrl,
      hasActiveRole: false,
      job,
      discoveredEmails: allEmails,
      careerPageUrl: careerLinks[0],
      contactPageUrl: contactLinks[0]
    };
  }
}
