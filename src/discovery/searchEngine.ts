import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import axios from 'axios';

export interface SearchResultTarget {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  contactEmail?: string;
}

// Helper to detect Chrome/Edge on system
async function getBrowserExecutable(): Promise<string | undefined> {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (const p of possiblePaths) {
    try {
      await fs.access(p);
      return p;
    } catch {
      // ignore
    }
  }
  return undefined;
}

// 1. Real Headless Browser Google Search Engine
export async function searchGoogleViaBrowser(
  query: string,
  limit: number = 10
): Promise<SearchResultTarget[]> {
  const results: SearchResultTarget[] = [];
  const visitedDomains = new Set<string>();

  const blacklistedDomains = [
    'google.com',
    'youtube.com',
    'facebook.com',
    'twitter.com',
    'x.com',
    'instagram.com',
    'pinterest.com',
    'wikipedia.org',
    'reddit.com',
    'quora.com'
  ];

  const executablePath = await getBrowserExecutable();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,800'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Extract search result links from Google DOM
    const rawResults = await page.evaluate(() => {
      const items: { title: string; url: string; snippet: string }[] = [];
      const blocks = document.querySelectorAll('div.g, div[data-hveid]');

      blocks.forEach((b) => {
        const linkEl = b.querySelector('a') as HTMLAnchorElement;
        const titleEl = b.querySelector('h3');
        const snippetEl = b.querySelector('div[style*="-webkit-line-clamp"], div.VwiC3b');

        if (linkEl && titleEl && linkEl.href && linkEl.href.startsWith('http')) {
          items.push({
            title: titleEl.textContent?.trim() || '',
            url: linkEl.href,
            snippet: snippetEl?.textContent?.trim() || ''
          });
        }
      });
      return items;
    });

    for (const item of rawResults) {
      if (results.length >= limit) break;
      if (!item.url) continue;

      try {
        const parsed = new URL(item.url);
        const domain = parsed.hostname.replace(/^www\./, '').toLowerCase();

        const isBlacklisted = blacklistedDomains.some((b) => domain.includes(b));
        if (!isBlacklisted && !visitedDomains.has(domain)) {
          visitedDomains.add(domain);
          results.push({
            title: item.title || domain,
            url: item.url,
            snippet: item.snippet,
            domain
          });
        }
      } catch {
        // ignore
      }
    }
  } catch (err: any) {
    console.warn('[SearchEngine] Google browser search warning:', err.message);
  } finally {
    await browser.close();
  }

  return results;
}

// 2. Hacker News "Who is Hiring" Startup Search (Fast direct API fallback)
export async function searchHNHiringStartups(
  keyword: string,
  limit: number = 5
): Promise<SearchResultTarget[]> {
  const results: SearchResultTarget[] = [];
  try {
    const hnRes = await axios.get(
      `https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=Ask%20HN:%20Who%20is%20hiring&hitsPerPage=1`,
      { timeout: 6000 }
    );

    const latestStory = hnRes.data?.hits?.[0];
    if (!latestStory) return [];

    const storyId = latestStory.objectID;
    const cleanKw = keyword.split(' ')[0] || 'remote'; // search primary keyword

    const commentsRes = await axios.get(
      `https://hn.algolia.com/api/v1/search?tags=comment,story_${storyId}&query=${encodeURIComponent(
        cleanKw
      )}&hitsPerPage=${limit * 2}`,
      { timeout: 6000 }
    );

    const hits = commentsRes.data?.hits || [];

    for (const hit of hits) {
      if (results.length >= limit) break;
      const text = hit.comment_text || '';
      const cleanText = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

      const urlMatch = text.match(/href="([^"]+)"/i) || text.match(/(https?:\/\/[^\s<]+)/i);
      const emailMatch = cleanText.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);

      let targetUrl = urlMatch ? urlMatch[1] : '';
      if (targetUrl) {
        targetUrl = targetUrl
          .replace(/&#x2F;/g, '/')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '')
          .replace(/&#x27;/g, "'");
      }

      if (!targetUrl && emailMatch) {
        const domain = emailMatch[1].split('@')[1];
        targetUrl = `https://${domain}`;
      }

      if (targetUrl && targetUrl.startsWith('http')) {
        const parsed = new URL(targetUrl);
        const domain = parsed.hostname.replace(/^www\./, '');

        results.push({
          title: cleanText.slice(0, 80) + '...',
          url: targetUrl,
          snippet: cleanText.slice(0, 300),
          domain,
          contactEmail: emailMatch ? emailMatch[1] : undefined
        });
      }
    }
  } catch {
    // ignore
  }
  return results;
}

// 3. Combined Multi-Engine Search
export async function searchStartupsAndJobs(
  query: string,
  limit: number = 10
): Promise<SearchResultTarget[]> {
  // 1. First run real Google search via headless browser
  const googleResults = await searchGoogleViaBrowser(query, limit);
  if (googleResults.length >= limit) {
    return googleResults.slice(0, limit);
  }

  // 2. Supplement with Hacker News Who is Hiring
  const hnResults = await searchHNHiringStartups(query, limit - googleResults.length);
  return [...googleResults, ...hnResults];
}

// Preset Dorks and Keyword Strategies
export const SEARCH_PRESETS: Record<string, string[]> = {
  'ai-startups': [
    'AI startups hiring remote Next.js',
    'site:boards.greenhouse.io "AI" "Software Engineer" "Remote"',
    'site:jobs.lever.co "AI" "Full Stack" "Remote"',
    'site:ashbyhq.com "AI" "TypeScript" "Remote"'
  ],
  'nextjs-fullstack': [
    'Next.js remote full stack developer startup jobs',
    'site:boards.greenhouse.io "Next.js" "TypeScript" "Remote"',
    'site:jobs.lever.co "Next.js" "Node.js" "Remote"'
  ],
  'yc-startups': [
    'site:workatastartup.com/companies "Full Stack" "Remote"',
    '"Y Combinator" "Software Engineer" "Remote" "careers"'
  ],
  'backend-microservices': [
    'site:boards.greenhouse.io "NestJS" OR "Node.js" "Microservices" "Remote"',
    'site:jobs.lever.co "Backend Engineer" "PostgreSQL" "GCP" "Remote"'
  ]
};
