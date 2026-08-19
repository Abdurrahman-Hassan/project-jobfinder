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
  timeoutMs: number = 3500
): Promise<string | null> {
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
        { timeout: timeoutMs }
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
          model: 'nvidia/nemotron-3.5-lightning:free',
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
          timeout: timeoutMs
        }
      );
      const text = res.data?.choices?.[0]?.message?.content;
      if (text) return text;
    } catch {}
  }

  return null;
}

/**
 * Step 1: LLM Query Optimizer
 * Transforms raw user input into 3 high-intent corporate discovery queries.
 */
export async function optimizeSearchQueryWithLLM(
  rawQuery: string,
  region?: string
): Promise<string[]> {
  console.log(chalk.gray(`  • Optimizing search query with AI agent...`));

  const clean = rawQuery.replace(/["']/g, '').trim();
  const reg = region && region.toLowerCase() !== 'any' ? region : '';

  const systemPrompt = `You are a search query strategist. Given a query, return 3 Bing/DDG queries to find DIRECT tech company homepages (not blogs, not job boards, not recruiting agencies).
Format: { "queries": ["q1", "q2", "q3"] }`;

  const userPrompt = `Query: "${rawQuery}" Region: "${reg}"`;

  try {
    const rawResponse = await callUniversalLLM(systemPrompt, userPrompt, 3000);
    if (rawResponse) {
      const firstBrace = rawResponse.indexOf('{');
      const lastBrace = rawResponse.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        const parsed = JSON.parse(rawResponse.slice(firstBrace, lastBrace + 1));
        if (Array.isArray(parsed.queries) && parsed.queries.length > 0) {
          console.log(chalk.bold.green(`  ✓ AI Generated ${parsed.queries.length} precision search queries`));
          return parsed.queries;
        }
      }
    }
  } catch {}

  // Smart Deterministic Query Expansion Fallback
  console.log(chalk.gray(`  • Using deterministic search query expansion`));
  return [
    `"software development company" ${clean} ${reg} -site:linkedin.com -site:indeed.com`,
    `"software house" ${clean} ${reg} "services" "about us" -site:linkedin.com`,
    `"web development company" ${clean} ${reg} "contact" -site:linkedin.com`
  ];
}

/**
 * Step 2: LLM Web Target Vetting & Filter
 * Analyzes raw search results and filters out staffing agencies, job boards, and listicles.
 */
export async function filterAndSelectCompaniesWithLLM(
  rawResults: { title: string; url: string; snippet: string }[],
  profile: CandidateProfile
): Promise<VettedCompanyTarget[]> {
  if (rawResults.length === 0) return [];

  console.log(chalk.gray(`  • Vetting ${rawResults.length} search results with AI to filter out agencies & aggregators...`));

  const systemPrompt = `You are a tech recruiter vetting agent.
Analyze these search results. Extract ONLY DIRECT software companies/startups (discard staffing agencies, job boards, blog listicles).
Format:
{
  "companies": [
    {
      "companyName": "Name",
      "websiteUrl": "https://company.com",
      "domain": "company.com",
      "reasoning": "Direct software agency / tech company",
      "isRecruitingAgency": false
    }
  ]
}`;

  const userPrompt = `Search Results:\n${JSON.stringify(rawResults.slice(0, 10), null, 2)}`;

  try {
    const rawResponse = await callUniversalLLM(systemPrompt, userPrompt, 3500);
    if (rawResponse) {
      const firstBrace = rawResponse.indexOf('{');
      const lastBrace = rawResponse.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        const parsed = JSON.parse(rawResponse.slice(firstBrace, lastBrace + 1));
        if (Array.isArray(parsed.companies) && parsed.companies.length > 0) {
          const vetted = parsed.companies.filter(
            (c: VettedCompanyTarget) => !c.isRecruitingAgency && c.websiteUrl && c.websiteUrl.startsWith('http')
          );
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
