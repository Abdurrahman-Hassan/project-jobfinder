import axios from 'axios';
import chalk from 'chalk';
import { Browser, Page } from 'puppeteer';
import { launchManagedBrowser } from '../utils/browserManager.js';
import { getRandomUserAgent } from '../utils/userAgents.js';
import { extractEmailsFromHtml } from '../enrichment/emailExtractor.js';

export interface SearchResultTarget {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  contactEmail?: string;
  source?: string;
  location?: string;
}

// Job aggregator directory domains, banks, dictionaries, and non-job sites to strictly ignore
const IGNORED_DOMAINS = [
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'monster.com',
  'simplyhired.com',
  'careerbuilder.com',
  'rozee.pk',
  'upwork.com',
  'fiverr.com',
  'freelancer.com',
  'turing.com',
  'bebee.com',
  'jooble.org',
  'talent.com',
  'salary.com',
  'wikipedia.org',
  'youtube.com',
  'facebook.com',
  'twitter.com',
  'instagram.com',
  'reddit.com',
  'medium.com',
  'quora.com',
  'onlyfrontendjobs.com',
  'remoterocketship.com',
  'jaabz.com',
  'builtin.com',
  'f6s.com',
  'clutch.co',
  'goodfirms.co',
  'g2.com',
  'techbehemoths.com',
  'dictionary.cambridge.org',
  'merriam-webster.com',
  'collinsdictionary.com',
  'thefreedictionary.com',
  'wiktionary.org',
  'lcl.fr',
  'yettel.hu'
];

export function isStaffingOrAgencyText(text: string): boolean {
  const agencyRegexes = [
    /\b(staffing|recruiting|recruitment)\s+(agency|firm|partner|service|solutions|group)\b/i,
    /\bon\s+behalf\s+of\s+(our\s+)?client\b/i,
    /\bour\s+client\s+is\s+(looking|hiring|seeking|a)\b/i,
    /\btalent\s+(network|marketplace|solutions|partner|agency|pool|hub)\b/i,
    /\boutsourcing\s+(firm|company|service|agency)\b/i,
    /\bplacement\s+agency\b/i,
    /\bheadhunting\b/i,
    /\bcontingent\s+workforce\b/i,
    /\bclient\s+placement\b/i
  ];

  const knownAgencies = [
    'pavago',
    'smart working solutions',
    'cybercoders',
    'robert half',
    'teksystems',
    'kforce',
    'randstad',
    'adecco',
    'hays',
    'michael page',
    'motion recruitment',
    'apex systems',
    'insight global',
    'turing',
    'andela',
    'crossover',
    'bairesdev'
  ];

  const lower = text.toLowerCase();
  return agencyRegexes.some((r) => r.test(lower)) || knownAgencies.some((a) => lower.includes(a));
}

function isLegitimateJobResult(title: string, snippet: string, url: string): boolean {
  const text = `${title} ${snippet} ${url}`.toLowerCase();

  // Reject staffing & recruitment agencies
  if (isStaffingOrAgencyText(text)) {
    return false;
  }

  const hasTechKeyword =
    text.includes('engineer') ||
    text.includes('developer') ||
    text.includes('full stack') ||
    text.includes('frontend') ||
    text.includes('backend') ||
    text.includes('software') ||
    text.includes('next.js') ||
    text.includes('react') ||
    text.includes('architect') ||
    text.includes('tech lead');

  const hasJobContext =
    text.includes('job') ||
    text.includes('career') ||
    text.includes('hiring') ||
    text.includes('remote') ||
    text.includes('apply') ||
    url.includes('/job/') ||
    url.includes('/jobs/') ||
    url.includes('/j/') ||
    url.includes('/careers/') ||
    url.includes('lever.co') ||
    url.includes('greenhouse.io') ||
    url.includes('ashbyhq.com') ||
    url.includes('workable.com');

  return hasTechKeyword && hasJobContext;
}

export function matchesRequestedRegion(jobLoc: string, requestedRegion?: string): boolean {
  if (
    !requestedRegion ||
    requestedRegion.toLowerCase() === 'any' ||
    requestedRegion.toLowerCase() === 'all' ||
    requestedRegion.toLowerCase() === 'worldwide' ||
    requestedRegion.toLowerCase() === 'remote'
  ) {
    return true;
  }
  const req = requestedRegion.toLowerCase().trim();
  const loc = (jobLoc || '').toLowerCase();

  // If user requested Pakistan
  if (req.includes('pak')) {
    if (
      loc.includes('pakistan') ||
      loc.includes('karachi') ||
      loc.includes('lahore') ||
      loc.includes('islamabad') ||
      loc.includes('rawalpindi')
    ) {
      return true;
    }
    // Accept global / worldwide remote, but reject explicitly geo-locked foreign roles
    if (
      (loc.includes('worldwide') || loc.includes('anywhere') || loc.includes('global')) &&
      !loc.includes('germany') &&
      !loc.includes('stuttgart') &&
      !loc.includes('berlin') &&
      !loc.includes('uk only') &&
      !loc.includes('us only')
    ) {
      return true;
    }
    return false;
  }

  // If user requested US
  if (req === 'us' || req.includes('united states') || req.includes('america')) {
    return loc.includes('us') || loc.includes('united states') || loc.includes('worldwide') || loc.includes('anywhere') || loc.includes('global');
  }

  // If user requested Europe / UK
  if (req.includes('europe') || req.includes('eu') || req === 'uk') {
    return loc.includes('europe') || loc.includes('uk') || loc.includes('germany') || loc.includes('worldwide') || loc.includes('anywhere');
  }

  return loc.includes(req) || loc.includes('worldwide') || loc.includes('anywhere') || loc.includes('global');
}

function buildRegionFilterString(region?: string): string {
  if (!region || region.toLowerCase() === 'any' || region.toLowerCase() === 'all') {
    return 'remote';
  }
  const clean = region.trim().toLowerCase();
  if (clean.includes('pak')) {
    return '("Pakistan" OR "Lahore" OR "Karachi" OR "Islamabad" OR "Remote")';
  }
  if (clean === 'worldwide' || clean === 'global') {
    return '("Worldwide" OR "Anywhere" OR "Global" OR remote)';
  }
  return `("${region.trim()}" OR remote)`;
}

export async function applyStealthEvasions(page: Page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    (window as any).chrome = {
      app: { isInstalled: false, InstallState: { DISABLED: 'disabled' }, RunningState: { CANNOT_RUN: 'cannot_run' } },
      runtime: {
        OnInstalledReason: { INSTALL: 'install', UPDATE: 'update', CHROME_UPDATE: 'chrome_update', SHARED_MODULE_UPDATE: 'shared_module_update' },
        PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
        PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' }
      }
    };
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });
}

function extractGoogleResultsFromDom(page: Page, maxResults: number) {
  return page.evaluate((limit: number) => {
    const items: { title: string; url: string; snippet: string }[] = [];
    const allAnchors = Array.from(document.querySelectorAll('a'));

    allAnchors.forEach((a) => {
      if (items.length >= limit) return;
      const h3 = a.querySelector('h3') || (a.parentElement?.querySelector('h3') as HTMLElement);
      const url = a.href;

      if (h3 && url && url.startsWith('http')) {
        const title = h3.innerText.trim();
        if (
          title &&
          !url.includes('google.com/search') &&
          !url.includes('google.com/sorry') &&
          !url.includes('support.google.com') &&
          !url.includes('accounts.google.com') &&
          !url.includes('maps.google.com')
        ) {
          const container = a.closest('div.g, div[data-hveid], #rso > div') || a.parentElement;
          const snippetEl = container?.querySelector('div.VwiC3b, span.aCOpRe, div[style*="-webkit-line-clamp"]');
          const snippet = snippetEl ? (snippetEl as HTMLElement).innerText.trim() : '';

          items.push({
            title,
            url,
            snippet
          });
        }
      }
    });

    return items;
  }, maxResults);
}

// 1. Google Live Search (Stealth Headless + Region Filter + Interactive CAPTCHA Solver)
export async function searchGoogleLive(
  query: string,
  limit: number = 10,
  region?: string,
  maxWaitTimeMs: number = 90000
): Promise<SearchResultTarget[]> {
  const results: SearchResultTarget[] = [];
  const seenUrls = new Set<string>();

  const cleanKeyword = query.replace(/["']/g, '').trim();
  const regionClause = buildRegionFilterString(region);
  const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(
    `site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR site:apply.workable.com OR site:jobs.smartrecruiters.com ${cleanKeyword} ${regionClause} -staffing -recruiting -recruitment`
  )}&hl=en&num=${Math.max(50, limit * 3)}`;

  let headlessBrowser: Browser | null = null;
  let isCaptchaDetected = false;

  try {
    headlessBrowser = await launchManagedBrowser({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1366,768'
      ]
    });

    const page = await headlessBrowser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(getRandomUserAgent());
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1'
    });
    await applyStealthEvasions(page);

    await page.goto(googleSearchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const consentButton = await page.$(
      'button#L2AGLb, button[aria-label="Accept all"], div[role="dialog"] button'
    );
    if (consentButton) {
      await consentButton.click().catch(() => {});
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
    }

    const currentUrl = page.url();
    isCaptchaDetected =
      currentUrl.includes('/sorry/') ||
      (await page.$('#captcha-form, iframe[src*="recaptcha"], div.g-recaptcha')) !== null;

    if (!isCaptchaDetected) {
      const rawResults = await extractGoogleResultsFromDom(page, limit * 3);
      for (const r of rawResults) {
        if (results.length >= limit) break;
        try {
          let cleanUrl = r.url;
          if (cleanUrl.endsWith('/apply/')) cleanUrl = cleanUrl.slice(0, -6);
          else if (cleanUrl.endsWith('/apply')) cleanUrl = cleanUrl.slice(0, -5);
          cleanUrl = cleanUrl.replace(/[?&]lever-source=[^&]+/, '');

          const domain = new URL(cleanUrl).hostname.replace(/^www\./, '');
          if (
            !IGNORED_DOMAINS.some((d) => domain.includes(d)) &&
            !seenUrls.has(cleanUrl) &&
            isLegitimateJobResult(r.title, r.snippet, cleanUrl)
          ) {
            seenUrls.add(cleanUrl);
            results.push({
              title: r.title,
              url: cleanUrl,
              snippet: r.snippet,
              domain,
              location: region || 'Remote',
              source: 'Google Search (Direct ATS)'
            });
          }
        } catch {
          // ignore
        }
      }

      if (results.length >= limit) {
        return results;
      }
    }
  } catch {
    // proceed to interactive window if CAPTCHA was flagged
  } finally {
    if (headlessBrowser) {
      await headlessBrowser.close().catch(() => {});
    }
  }

  // Interactive Visible Window (Headed Fallback) for Human CAPTCHA Solving
  if (isCaptchaDetected) {
    console.log(chalk.bold.yellow('\n⚠️  Google bot verification challenge detected!'));
    console.log(chalk.bold.cyan('👉 Opening a Chrome browser window on your screen to solve the CAPTCHA...'));
    console.log(
      chalk.gray(
        `⏳ Please solve the puzzle/checkbox in Chrome. The script will automatically resume once solved (waiting up to ${maxWaitTimeMs / 1000}s)...\n`
      )
    );

    let visibleBrowser: Browser | null = null;
    try {
      visibleBrowser = await launchManagedBrowser({
        headless: false,
        defaultViewport: null,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--start-maximized'
        ]
      });

      const page = (await visibleBrowser.pages())[0] || (await visibleBrowser.newPage());
      await page.setUserAgent(getRandomUserAgent());
      await applyStealthEvasions(page);

      await page.goto(googleSearchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // Poll until the CAPTCHA /sorry/ screen disappears and REAL Google search result links render
      const startTime = Date.now();
      let solved = false;

      while (Date.now() - startTime < maxWaitTimeMs) {
        try {
          const currentUrl = page.url();
          const hasSorry = currentUrl.includes('/sorry/');
          const isSearchUrl = currentUrl.includes('google.com/search') || currentUrl.includes('google.');

          if (!hasSorry && isSearchUrl) {
            // Count actual non-Google third-party search result links
            const realResultCount = await page
              .evaluate(() => {
                const allLinks = Array.from(document.querySelectorAll('a'));
                const realLinks = allLinks.filter((a) => {
                  const h3 =
                    a.querySelector('h3') || (a.parentElement?.querySelector('h3') as HTMLElement);
                  const href = a.href || '';
                  return (
                    h3 &&
                    h3.innerText.trim().length > 3 &&
                    href.startsWith('http') &&
                    !href.includes('google.com') &&
                    !href.includes('/sorry/')
                  );
                });
                return realLinks.length;
              })
              .catch(() => 0);

            if (realResultCount >= 1) {
              solved = true;
              break;
            }
          }
        } catch {
          // Page is currently in the middle of a redirect/navigation, retry on next tick
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (solved) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        console.log(chalk.bold.green('✓ Verification solved! Extracting direct job listings...'));

        let rawResults: any[] = [];
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            rawResults = await extractGoogleResultsFromDom(page, limit * 3);
            if (rawResults.length > 0) break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }

        for (const r of rawResults) {
          if (results.length >= limit) break;
          try {
            let cleanUrl = r.url;
            if (cleanUrl.endsWith('/apply/')) cleanUrl = cleanUrl.slice(0, -6);
            else if (cleanUrl.endsWith('/apply')) cleanUrl = cleanUrl.slice(0, -5);
            cleanUrl = cleanUrl.replace(/[?&]lever-source=[^&]+/, '');

            const domain = new URL(cleanUrl).hostname.replace(/^www\./, '');
            if (
              !IGNORED_DOMAINS.some((d) => domain.includes(d)) &&
              !seenUrls.has(cleanUrl) &&
              isLegitimateJobResult(r.title, r.snippet, cleanUrl)
            ) {
              seenUrls.add(cleanUrl);
              results.push({
                title: r.title,
                url: cleanUrl,
                snippet: r.snippet,
                domain,
                location: region || 'Remote',
                source: 'Google Search (Direct ATS)'
              });
            }
          } catch {
            // ignore
          }
        }
      } else {
        console.log(chalk.yellow('⏱️ Verification timed out. Falling back to backup feeds.'));
      }
    } catch (err: any) {
      console.warn(chalk.yellow(`[Interactive Google Search Warning] ${err.message}`));
    } finally {
      if (visibleBrowser) {
        await visibleBrowser.close().catch(() => {});
      }
    }
  }

  if (results.length < limit) {
    try {
      const backup = await searchDuckDuckGoLive(query, limit - results.length, region);
      for (const b of backup) {
        if (!seenUrls.has(b.url)) {
          seenUrls.add(b.url);
          results.push(b);
        }
      }
    } catch {}
  }

  return results;
}

// 2. Bing Live Web Search (Clean keywords with Region & strict job validation)
export async function searchBingLive(
  query: string,
  limit: number = 10,
  region?: string
): Promise<SearchResultTarget[]> {
  const results: SearchResultTarget[] = [];
  const seenUrls = new Set<string>();
  const cleanKeyword = query.replace(/["']/g, '').trim();
  const regionTag = region && region.toLowerCase() !== 'any' ? region : 'remote';

  let browser;
  try {
    browser = await launchManagedBrowser();
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.setUserAgent(getRandomUserAgent());

    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(
      `"${cleanKeyword}" ${regionTag} jobs`
    )}&ensearch=1&count=${limit + 10}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const raw = await page.evaluate(() => {
      const items: any[] = [];
      document.querySelectorAll('li.b_algo').forEach((el) => {
        const a = el.querySelector('h2 a') as HTMLAnchorElement;
        const snippet = el.querySelector('.b_caption p, .b_algoSlug') as HTMLElement;
        if (a && a.href) {
          items.push({
            title: a.innerText.trim(),
            url: a.href,
            snippet: snippet ? snippet.innerText.trim() : ''
          });
        }
      });
      return items;
    });

    for (const r of raw) {
      if (results.length >= limit) break;

      let cleanUrl = r.url;
      if (cleanUrl.includes('bing.com/ck/a?')) {
        const match = cleanUrl.match(/[?&]u=([^&]+)/);
        if (match && match[1]) {
          const rawBase64 = match[1];
          const base64Str = rawBase64.startsWith('a1') ? rawBase64.slice(2) : rawBase64;
          try {
            cleanUrl = Buffer.from(base64Str, 'base64').toString('utf-8');
          } catch {
            // fallback
          }
        }
      }

      if (cleanUrl.startsWith('http') && !cleanUrl.includes('bing.com')) {
        try {
          const domain = new URL(cleanUrl).hostname.replace(/^www\./, '');
          if (
            !IGNORED_DOMAINS.some((d) => domain.includes(d)) &&
            !seenUrls.has(cleanUrl) &&
            isLegitimateJobResult(r.title, r.snippet, cleanUrl)
          ) {
            seenUrls.add(cleanUrl);
            results.push({
              title: r.title,
              url: cleanUrl,
              snippet: r.snippet,
              domain,
              location: region || 'Remote',
              source: 'Bing Search'
            });
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Bing Search Warning] Search warning: ${err.message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  return results;
}

// 3. DuckDuckGo Live Web Search (Stealth Headless with Region & strict job validation)
export async function searchDuckDuckGoLive(
  query: string,
  limit: number = 10,
  region?: string
): Promise<SearchResultTarget[]> {
  const results: SearchResultTarget[] = [];
  const seenUrls = new Set<string>();
  const cleanKeyword = query.replace(/["']/g, '').trim();
  const regionTag = region && region.toLowerCase() !== 'any' ? region : 'remote';

  let browser;
  try {
    browser = await launchManagedBrowser();
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.setUserAgent(getRandomUserAgent());

    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(
      `${cleanKeyword} ${regionTag} jobs`
    )}&ia=web`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 20000 });

    const raw = await page.evaluate(() => {
      const items: any[] = [];
      document.querySelectorAll('article, li[data-layout="organic"]').forEach((el) => {
        const a = el.querySelector('h2 a, a[data-testid="result-title-a"]') as HTMLAnchorElement;
        const snippet = el.querySelector('[data-result="snippet"]') as HTMLElement;
        if (a && a.href && !a.href.includes('duckduckgo.com')) {
          items.push({
            title: a.innerText.trim(),
            url: a.href,
            snippet: snippet ? snippet.innerText.trim() : ''
          });
        }
      });
      return items;
    });

    for (const r of raw) {
      if (results.length >= limit) break;
      if (r.url.startsWith('http') && !r.url.includes('duckduckgo.com')) {
        try {
          const domain = new URL(r.url).hostname.replace(/^www\./, '');
          if (
            !IGNORED_DOMAINS.some((d) => domain.includes(d)) &&
            !seenUrls.has(r.url) &&
            isLegitimateJobResult(r.title, r.snippet, r.url)
          ) {
            seenUrls.add(r.url);
            results.push({
              title: r.title,
              url: r.url,
              snippet: r.snippet,
              domain,
              location: region || 'Remote',
              source: 'DuckDuckGo Search'
            });
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (err: any) {
    console.warn(`[DDG Search Warning] DuckDuckGo search warning: ${err.message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  return results;
}


// 4. Remote Tech Job Feed APIs (Remotive, Arbeitnow with location filtering)
export async function searchRemoteFeeds(
  query: string,
  limit: number = 5,
  region?: string
): Promise<SearchResultTarget[]> {
  const results: SearchResultTarget[] = [];
  const seenUrls = new Set<string>();
  const cleanKeyword = query.toLowerCase();
  const regionLower = (region || '').toLowerCase();

  // Remotive API
  try {
    const searchTerms = cleanKeyword.includes('next')
      ? 'next.js'
      : cleanKeyword.includes('full stack')
        ? 'full stack'
        : 'software';

    const res = await axios.get(
      `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(searchTerms)}`,
      {
        timeout: 6000,
        maxContentLength: 5 * 1024 * 1024,
        maxBodyLength: 5 * 1024 * 1024,
        headers: { 'User-Agent': getRandomUserAgent() }
      }
    );
    const jobs = res.data?.jobs || [];

    for (const j of jobs) {
      if (results.length >= limit) break;
      if (j.url && !seenUrls.has(j.url)) {
        const text = `${j.title} ${j.category}`.toLowerCase();
        const jobLoc = j.candidate_required_location || 'Remote';

        const matchesRegion = matchesRequestedRegion(jobLoc, region);

        if (
          (text.includes('engineer') ||
            text.includes('developer') ||
            text.includes('full') ||
            text.includes('software')) &&
          matchesRegion
        ) {
          seenUrls.add(j.url);
          results.push({
            title: `${j.title} at ${j.company_name}`,
            url: j.url,
            snippet: `${j.company_name} - ${j.title} (${j.candidate_required_location || 'Remote'})`,
            domain: 'remotive.com',
            location: j.candidate_required_location || 'Remote',
            source: 'Remotive API'
          });
        }
      }
    }
  } catch {
    // skip
  }

  // Arbeitnow API
  if (results.length < limit) {
    try {
      const res = await axios.get('https://www.arbeitnow.com/api/job-board-api', {
        timeout: 6000,
        maxContentLength: 5 * 1024 * 1024,
        maxBodyLength: 5 * 1024 * 1024,
        headers: { 'User-Agent': getRandomUserAgent() }
      });
      const jobs = res.data?.data || [];

      for (const j of jobs) {
        if (results.length >= limit) break;
        const text = `${j.title} ${j.description} ${(j.tags || []).join(' ')}`.toLowerCase();
        const jobLoc = j.location || 'Remote';

        const matchesRegion = matchesRequestedRegion(jobLoc, region);

        const isTech =
          text.includes('engineer') ||
          text.includes('developer') ||
          text.includes('full stack') ||
          text.includes('software') ||
          text.includes('next.js') ||
          text.includes('react');

        if (isTech && matchesRegion && j.url && !seenUrls.has(j.url)) {
          seenUrls.add(j.url);
          results.push({
            title: `${j.title} at ${j.company_name}`,
            url: j.url,
            snippet: `${j.company_name} is hiring: ${j.title} (${j.location || 'Remote'})`,
            domain: new URL(j.url).hostname.replace(/^www\./, ''),
            location: j.location || 'Remote',
            source: 'Arbeitnow API'
          });
        }
      }
    } catch {
      // skip
    }
  }

  return results;
}

// 5. Hacker News "Who is Hiring" Algolia API
export async function searchHNHiringStartups(
  keyword: string,
  limit: number = 5,
  region?: string
): Promise<SearchResultTarget[]> {
  const results: SearchResultTarget[] = [];
  const seenDomains = new Set<string>();

  try {
    const threadSearch = await axios.get(
      `https://hn.algolia.com/api/v1/search?query="Ask HN: Who is hiring?"&tags=story&hitsPerPage=2`,
      {
        timeout: 6000,
        maxContentLength: 5 * 1024 * 1024,
        maxBodyLength: 5 * 1024 * 1024,
        headers: { 'User-Agent': getRandomUserAgent() }
      }
    );

    const latestThread = threadSearch.data?.hits?.[0];
    if (!latestThread) return [];

    const threadId = latestThread.objectID;
    const cleanKeyword = keyword.toLowerCase().includes('next')
      ? 'next'
      : keyword.toLowerCase().includes('full stack')
        ? 'full stack'
        : 'engineer';

    const commentsSearch = await axios.get(
      `https://hn.algolia.com/api/v1/search?tags=comment,story_${threadId}&query=${encodeURIComponent(cleanKeyword)}&hitsPerPage=${limit * 2}`,
      {
        timeout: 6000,
        maxContentLength: 5 * 1024 * 1024,
        maxBodyLength: 5 * 1024 * 1024,
        headers: { 'User-Agent': getRandomUserAgent() }
      }
    );

    const comments = commentsSearch.data?.hits || [];

    for (const comment of comments) {
      if (results.length >= limit) break;

      const rawText = (comment.comment_text || '').replace(/<[^>]+>/g, ' ');
      if (rawText.length < 50) continue;

      const emails = extractEmailsFromHtml(comment.comment_text || '');
      const contactEmail = emails[0];

      const urlMatches = (comment.comment_text || '').match(/href=["'](https?:\/\/[^"']+)["']/gi) || [];
      for (const rawMatch of urlMatches) {
        const cleanUrl = rawMatch
          .replace(/^href=["']/, '')
          .replace(/["']$/, '')
          .replace(/&amp;/g, '&');

        if (
          cleanUrl.startsWith('http') &&
          !cleanUrl.includes('ycombinator.com') &&
          !cleanUrl.includes('github.com')
        ) {
          try {
            const domain = new URL(cleanUrl).hostname.replace(/^www\./, '');
            if (!seenDomains.has(domain) && !IGNORED_DOMAINS.some((d) => domain.includes(d))) {
              seenDomains.add(domain);
              const firstLine = rawText.split('\n')[0].slice(0, 80);
              results.push({
                title: firstLine || 'Hacker News Startup Lead',
                url: cleanUrl,
                snippet: rawText.slice(0, 300),
                domain,
                contactEmail,
                location: region || 'Remote',
                source: 'Hacker News'
              });
              break;
            }
          } catch {
            // invalid URL
          }
        }
      }
    }
  } catch (err: any) {
    console.warn(`[HN Search Warning] Hacker News API query warning: ${err.message}`);
  }

  return results;
}

// 6. Combined Multi-Engine Search with Region & Engine Selection
export async function searchStartupsAndJobs(
  query: string,
  limit: number = 10,
  region?: string,
  engineChoice?: string
): Promise<SearchResultTarget[]> {
  const combined: SearchResultTarget[] = [];
  const seenUrls = new Set<string>();
  const engine = (engineChoice || process.env.DEFAULT_SEARCH_ENGINE || 'bing').toLowerCase();

  // Mode 1: Bing Live Search
  if (engine === 'bing' || engine === 'all') {
    console.log(
      chalk.gray(
        `  • Querying Bing Live Search [Region: ${region || 'Worldwide / Remote'}]...`
      )
    );
    const bingResults = await searchBingLive(query, limit, region);
    for (const r of bingResults) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        combined.push(r);
      }
    }
  }

  // Mode 2: DuckDuckGo Live Search (when Bing needs more or when ddg selected)
  if ((engine === 'ddg' || engine === 'duckduckgo' || engine === 'all' || (engine === 'bing' && combined.length < limit)) && combined.length < limit) {
    const remaining = limit - combined.length;
    console.log(
      chalk.gray(
        `  • Querying DuckDuckGo Stealth Search (${remaining} needed)...`
      )
    );
    const ddgResults = await searchDuckDuckGoLive(query, remaining, region);
    for (const r of ddgResults) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        combined.push(r);
      }
    }
  }

  // Mode 3: Remote Job APIs (Remotive + Arbeitnow)
  if (combined.length < limit) {
    const remaining = limit - combined.length;
    const remoteResults = await searchRemoteFeeds(query, remaining, region);
    for (const r of remoteResults) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        combined.push(r);
      }
    }
  }

  // Mode 3: Hacker News "Who is Hiring"
  if (combined.length < limit) {
    const remaining = limit - combined.length;
    const hnResults = await searchHNHiringStartups(query, remaining, region);
    for (const r of hnResults) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        combined.push(r);
      }
    }
  }

  // Mode 4: Google Search (ONLY if engine is explicitly set to google or all)
  if ((engine === 'google' || engine === 'all') && combined.length < limit) {
    const remaining = limit - combined.length;
    console.log(
      chalk.gray(
        `  • Querying Google Search for Direct ATS Postings (${remaining} needed)...`
      )
    );
    const googleResults = await searchGoogleLive(query, remaining, region);
    for (const r of googleResults) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        combined.push(r);
      }
    }
  }

  return combined.slice(0, limit);
}

// 7. Universal AI-Orchestrated Dynamic Company Discovery
export async function searchCompanyWebsites(
  query: string,
  limit: number = 10,
  region?: string
): Promise<SearchResultTarget[]> {
  const { optimizeSearchQueryWithLLM, filterAndSelectCompaniesWithLLM } = await import(
    '../ai/llmSearchOrchestrator.js'
  );
  const { getActiveProfile } = await import('../config/profile.js');
  const profile = getActiveProfile();

  // 1. Stage 1: AI Query Optimization (Generates 3 precision dorks)
  const searchQueries = await optimizeSearchQueryWithLLM(query, region);

  const rawCandidatePool: { title: string; url: string; snippet: string }[] = [];
  const seenRawUrls = new Set<string>();

  let browser;
  try {
    browser = await launchManagedBrowser();
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.setUserAgent(getRandomUserAgent());

    for (const q of searchQueries) {
      if (rawCandidatePool.length >= limit * 3) break;

      console.log(chalk.gray(`  • Querying engine: "${q.slice(0, 70)}..."`));
      const ddgUrl = `https://duckduckgo.com/?q=${encodeURIComponent(q)}&ia=web`;
      await page.goto(ddgUrl, { waitUntil: 'networkidle2', timeout: 20000 });

      // If high limit requested, scroll down to load more organic results dynamically
      if (limit > 10) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const moreBtn = await page.$('button[id*="more"], a.result--more__btn, button[data-testid="more-results"]');
          if (moreBtn) {
            await moreBtn.click();
            await new Promise((r) => setTimeout(r, 1200));
          }
        } catch {}
      }

      const rawResults = await page.evaluate(() => {
        const items: { title: string; url: string; snippet: string }[] = [];
        document.querySelectorAll('article, li[data-layout="organic"]').forEach((el) => {
          const a = el.querySelector('h2 a, a[data-testid="result-title-a"]') as HTMLAnchorElement;
          const snippet = el.querySelector('[data-result="snippet"]') as HTMLElement;
          if (a && a.href && !a.href.includes('duckduckgo.com')) {
            items.push({
              title: a.innerText.trim(),
              url: a.href,
              snippet: snippet ? snippet.innerText.trim() : ''
            });
          }
        });
        return items;
      });

      for (const r of rawResults) {
        if (!seenRawUrls.has(r.url)) {
          seenRawUrls.add(r.url);
          rawCandidatePool.push(r);
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Company Search Warning] ${err.message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  // 2. Stage 2: AI Target Vetting (Filters out job agencies, aggregators, & blogs)
  const vettedCompanies = await filterAndSelectCompaniesWithLLM(rawCandidatePool, profile);

  const results: SearchResultTarget[] = [];
  for (const v of vettedCompanies) {
    if (results.length >= limit) break;
    results.push({
      title: v.companyName,
      url: v.websiteUrl,
      snippet: v.reasoning,
      domain: v.domain,
      location: region || 'Worldwide',
      source: 'AI-Vetted Corporate Target'
    });
  }

  return results.slice(0, limit);
}

export const SEARCH_PRESETS: Record<string, string[]> = {
  // 1. Direct Startup Reverse Sourcing & Speculative Matching
  'ai-mcp-startups': [
    'site:lever.co "Model Context Protocol"',
    'site:ashbyhq.com "Model Context Protocol"',
    'site:greenhouse.io "AI Agent" "TypeScript"',
    'site:lever.co "AI Engineer" "Full Stack"'
  ],
  'nextjs-saas-startups': [
    'site:lever.co "Next.js" "Software Engineer"',
    'site:greenhouse.io "Senior Full Stack" "Next.js"',
    'site:ashbyhq.com "Next.js" "TypeScript"'
  ],
  'hospitality-foodtech': [
    'site:lever.co "hospitality" "Full Stack"',
    'site:greenhouse.io "catering" "Engineer"',
    'site:ashbyhq.com "restaurant" "Software Engineer"'
  ],
  'pakistan-startups': [
    'site:lever.co "Pakistan" "Full Stack"',
    'site:greenhouse.io "Pakistan" "Software Engineer"',
    'site:ashbyhq.com "Pakistan" "Engineer"'
  ],
  // 2. Curated Open Roles
  'fullstack-ai': [
    'site:lever.co "Full Stack" "AI Engineer" remote',
    'site:greenhouse.io "Full Stack Engineer" "TypeScript" remote',
    'site:ashbyhq.com "Full Stack Engineer" "Next.js" remote'
  ],
  'nextjs-architect': [
    'site:lever.co "Next.js" "Software Engineer" remote',
    'site:greenhouse.io "Senior Frontend" "Next.js" remote',
    'site:ashbyhq.com "Senior Full Stack" "Next.js" remote'
  ],
  'mcp-agentic': [
    'site:lever.co "Model Context Protocol"',
    'site:greenhouse.io "AI Agent" "Full Stack"',
    'site:ashbyhq.com "Founding Engineer" "AI"'
  ],
  'pakistan-tech': [
    'site:lever.co "Pakistan" "Full Stack"',
    'site:greenhouse.io "Pakistan" "Software Engineer"',
    'site:ashbyhq.com "Pakistan" "Engineer"'
  ]
};
