import axios from 'axios';
import chalk from 'chalk';
import { CandidateProfile } from '../types/index.js';

export interface VettedCompanyTarget {
  companyName: string;
  websiteUrl: string;
  domain: string;
  reasoning: string;
  isRecruitingAgency: boolean;
}

/**
 * Fast Universal LLM Helper (Gemini Direct / OpenRouter / Ollama)
 */
export async function callUniversalLLM(
  systemPrompt: string,
  userPrompt: string,
  timeoutMs?: number
): Promise<string | null> {
  const resolvedTimeout =
    timeoutMs || parseInt(process.env.LLM_TIMEOUT_SECONDS || '20', 10) * 1000;

  // 1. Google Gemini Direct REST API
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey.length > 10) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
      const res = await axios.post(
        url,
        {
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
            }
          ],
          generationConfig: { temperature: 0.1 }
        },
        { timeout: resolvedTimeout, signal: AbortSignal.timeout(resolvedTimeout) }
      );
      const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch {}
  }

  // 2. OpenRouter Fast Model
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey && openRouterKey.length > 10) {
    try {
      const res = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-lightning:free',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1
        },
        {
          headers: {
            Authorization: `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json'
          },
          timeout: resolvedTimeout,
          signal: AbortSignal.timeout(resolvedTimeout)
        }
      );
      const text = res.data?.choices?.[0]?.message?.content;
      if (text) return text;
    } catch {}
  }

  return null;
}

/**
 * Step 1: LLM Query Optimizer (Ultra-Low Token Usage ~50 tokens)
 * Transforms raw user input into 3 high-intent corporate discovery queries.
 */
export async function optimizeSearchQueryWithLLM(
  rawQuery: string,
  region?: string
): Promise<string[]> {
  console.log(chalk.gray(`  • Optimizing search query with AI agent...`));

  const clean = rawQuery.replace(/["']/g, '').trim();
  const reg = region && region.toLowerCase() !== 'any' ? region : '';

  const systemPrompt = `You are a search strategist. Return JSON: {"queries":["q1","q2","q3"]} with 3 Bing/DDG queries to find direct corporate software houses & startups (not blogs, job boards, or staffing agencies).`;
  const userPrompt = `Query: "${clean.slice(0, 80)}" ${reg ? `Region: "${reg}"` : ''}`;

  try {
    const rawResponse = await callUniversalLLM(systemPrompt, userPrompt);
    if (rawResponse) {
      const firstBrace = rawResponse.indexOf('{');
      const lastBrace = rawResponse.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        const parsed = JSON.parse(rawResponse.slice(firstBrace, lastBrace + 1));
        if (Array.isArray(parsed.queries) && parsed.queries.length > 0) {
          console.log(chalk.bold.green(`  ✓ AI Generated ${parsed.queries.length} precision search queries`));
          return parsed.queries.slice(0, 3);
        }
      }
    }
  } catch {}

  // Smart Deterministic Query Expansion Fallback
  console.log(chalk.gray(`  • Using deterministic search query expansion`));
  return [
    `${clean} ${reg} software agency services -site:linkedin.com -site:indeed.com`,
    `${clean} ${reg} web development company contact -site:linkedin.com`,
    `software house ${clean} ${reg} -site:linkedin.com`
  ];
}

/**
 * Step 2: LLM Web Target Vetting & Filter (Ultra-Low Token Usage ~150 tokens)
 * Analyzes raw search results and filters out staffing agencies, job boards, and listicles.
 */
export async function filterAndSelectCompaniesWithLLM(
  rawResults: { title: string; url: string; snippet: string }[],
  profile: CandidateProfile
): Promise<VettedCompanyTarget[]> {
  if (rawResults.length === 0) return [];

  console.log(chalk.gray(`  • Vetting ${rawResults.length} search results with AI to filter out agencies & aggregators...`));

  // Build ultra-compact candidate list (title + domain only, no bloated HTML snippets)
  const compactCandidates = rawResults
    .slice(0, 10)
    .map((r, i) => `${i + 1}. ${r.title.slice(0, 50)} | ${r.url}`)
    .join('\n');

  const systemPrompt = `You are a tech recruiter. From the list, extract ONLY direct software companies/startups. Exclude job boards, staffing agencies, directories, and blogs.
Format: {"companies":[{"name":"Name","url":"https://domain.com"}]}`;

  const userPrompt = `Candidates:\n${compactCandidates}`;

  try {
    const rawResponse = await callUniversalLLM(systemPrompt, userPrompt);
    if (rawResponse) {
      const firstBrace = rawResponse.indexOf('{');
      const lastBrace = rawResponse.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        const parsed = JSON.parse(rawResponse.slice(firstBrace, lastBrace + 1));
        if (Array.isArray(parsed.companies) && parsed.companies.length > 0) {
          const vetted: VettedCompanyTarget[] = [];
          for (const c of parsed.companies) {
            const url = c.url || c.websiteUrl;
            if (url && url.startsWith('http')) {
              try {
                const parsedUrl = new URL(url);
                const domain = parsedUrl.hostname.replace(/^www\./, '');
                vetted.push({
                  companyName: c.name || c.companyName || domain.split('.')[0],
                  websiteUrl: `${parsedUrl.protocol}//${parsedUrl.hostname}`,
                  domain,
                  reasoning: 'Direct corporate tech provider verified by AI vetting',
                  isRecruitingAgency: false
                });
              } catch {}
            }
          }
          if (vetted.length > 0) {
            console.log(chalk.bold.green(`  ✓ AI Vetted ${vetted.length} direct non-agency company targets`));
            return vetted;
          }
        }
      }
    }
  } catch {}

  // Deterministic fallback
  console.log(chalk.gray(`  • Using deterministic rule-based vetting`));
  const vetted: VettedCompanyTarget[] = [];
  const seenDomains = new Set<string>();

  const BLACKLIST = [
    'linkedin.com',
    'indeed.com',
    'glassdoor.com',
    'clutch.co',
    'goodfirms.co',
    'f6s.com',
    'g2.com',
    'techbehemoths.com',
    'wikipedia.org',
    'upwork.com',
    'fiverr.com',
    'freelancer.com',
    'turing.com',
    'toptal.com',
    'urdupoint.com',
    'blogpakistan.pk',
    'superbcompanies.com',
    'agencyreview.dev',
    'seonextlevel.com',
    'znwebpro.com',
    'zorexadigital.com',
    'thedesignsfirm.com',
    'dakaan.pk',
    'rehbar.pk',
    'icreativez.com',
    'techmag.com.pk'
  ];

  for (const r of rawResults) {
    try {
      const parsed = new URL(r.url);
      const domain = parsed.hostname.replace(/^www\./, '');
      if (
        !BLACKLIST.some((b) => domain.includes(b)) &&
        !seenDomains.has(domain) &&
        !domain.includes('google') &&
        !domain.includes('bing')
      ) {
        seenDomains.add(domain);
        const name = r.title.split(/[-–|:]/)[0].trim();
        vetted.push({
          companyName: name || domain.split('.')[0],
          websiteUrl: `${parsed.protocol}//${parsed.hostname}`,
          domain,
          reasoning: 'Direct corporate software provider identified via heuristic vetting',
          isRecruitingAgency: false
        });
      }
    } catch {}
  }

  return vetted;
}
