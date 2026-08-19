import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { getRandomUserAgent } from '../utils/userAgents.js';

export async function findCareerPagesFromSitemap(domainOrUrl: string): Promise<string[]> {
  let baseUrl = domainOrUrl.trim();
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }

  const parsed = new URL(baseUrl);
  const origin = parsed.origin;
  const careerUrls = new Set<string>();

  const commonPaths = [
    '/careers',
    '/jobs',
    '/about/careers',
    '/join-us',
    '/company/careers',
    '/career',
    '/open-positions'
  ];

  // 1. Probe common career endpoints
  for (const path of commonPaths) {
    const testUrl = `${origin}${path}`;
    try {
      const res = await axios.head(testUrl, {
        timeout: 5000,
        maxContentLength: 5 * 1024 * 1024,
        maxBodyLength: 5 * 1024 * 1024,
        headers: { 'User-Agent': getRandomUserAgent() },
        validateStatus: (status) => status >= 200 && status < 400
      });
      if (res.status === 200 || res.status === 301 || res.status === 302) {
        careerUrls.add(testUrl);
      }
    } catch {
      // 404 or connection failure for endpoint probe is normal
    }
  }

  // 2. Parse sitemap.xml
  const sitemapEndpoints = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  const parser = new XMLParser();

  for (const smUrl of sitemapEndpoints) {
    try {
      const res = await axios.get(smUrl, {
        timeout: 6000,
        maxContentLength: 5 * 1024 * 1024,
        maxBodyLength: 5 * 1024 * 1024,
        headers: { 'User-Agent': getRandomUserAgent() }
      });
      if (res.status === 200 && res.data && typeof res.data === 'string') {
        const jsonObj = parser.parse(res.data);

        // Standard sitemap (<urlset><url><loc>...</loc></url></urlset>)
        if (jsonObj.urlset && jsonObj.urlset.url) {
          const urls = Array.isArray(jsonObj.urlset.url)
            ? jsonObj.urlset.url
            : [jsonObj.urlset.url];
          for (const item of urls) {
            const loc = String(item.loc || '');
            if (/career|job|position|hiring|work-with-us/i.test(loc)) {
              careerUrls.add(loc);
            }
          }
        }

        // Sitemap Index (<sitemapindex><sitemap><loc>...</loc></sitemap></sitemapindex>)
        if (jsonObj.sitemapindex && jsonObj.sitemapindex.sitemap) {
          const sitemaps = Array.isArray(jsonObj.sitemapindex.sitemap)
            ? jsonObj.sitemapindex.sitemap
            : [jsonObj.sitemapindex.sitemap];
          for (const item of sitemaps) {
            const loc = String(item.loc || '');
            if (/career|job|position/i.test(loc)) {
              careerUrls.add(loc);
            }
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Sitemap] Note: Could not fetch sitemap at ${smUrl} (${err.message})`);
    }
  }

  return Array.from(careerUrls);
}
