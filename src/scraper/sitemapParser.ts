import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

export async function findCareerPagesFromSitemap(domainOrUrl: string): Promise<string[]> {
  let baseUrl = domainOrUrl.trim();
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }

  const parsedUrl = new URL(baseUrl);
  const origin = parsedUrl.origin;
  const discoveredUrls: Set<string> = new Set();

  const careerKeywords = [
    'career',
    'careers',
    'job',
    'jobs',
    'join',
    'join-us',
    'work-with-us',
    'open-positions',
    'openings',
    'vacancies',
    'hiring'
  ];

  // 1. Direct standard paths to check
  const commonPaths = [
    '/careers',
    '/jobs',
    '/join-us',
    '/open-positions',
    '/work-with-us',
    '/about/careers',
    '/company/careers'
  ];

  for (const path of commonPaths) {
    try {
      const fullUrl = `${origin}${path}`;
      const res = await axios.get(fullUrl, {
        timeout: 5000,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (res.status === 200) {
        discoveredUrls.add(fullUrl);
      }
    } catch {
      // ignore 404s
    }
  }

  // 2. Check sitemap.xml
  const sitemapEndpoints = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  const parser = new XMLParser();

  for (const sitemapUrl of sitemapEndpoints) {
    try {
      const res = await axios.get(sitemapUrl, {
        timeout: 6000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      if (res.status === 200 && typeof res.data === 'string') {
        const parsed = parser.parse(res.data);
        const urlList: string[] = [];

        if (parsed.urlset && parsed.urlset.url) {
          const items = Array.isArray(parsed.urlset.url) ? parsed.urlset.url : [parsed.urlset.url];
          for (const item of items) {
            if (item.loc) urlList.push(String(item.loc));
          }
        } else if (parsed.sitemapindex && parsed.sitemapindex.sitemap) {
          const items = Array.isArray(parsed.sitemapindex.sitemap)
            ? parsed.sitemapindex.sitemap
            : [parsed.sitemapindex.sitemap];
          for (const item of items) {
            if (item.loc) urlList.push(String(item.loc));
          }
        }

        for (const u of urlList) {
          const lower = u.toLowerCase();
          if (careerKeywords.some((kw) => lower.includes(kw))) {
            discoveredUrls.add(u);
          }
        }
      }
    } catch {
      // sitemap not found or blocked
    }
  }

  return Array.from(discoveredUrls);
}
