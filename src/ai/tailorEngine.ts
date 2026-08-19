import axios from 'axios';
import { CandidateProfile, JobListing, ATSAnalysis } from '../types/index.js';
import { calculateATSScore } from './atsScorer.js';
import { LLMOutputSchema, sanitizeHeaderString } from '../validation/schemas.js';

export async function generateTailoredApplication(
  profile: CandidateProfile,
  job: JobListing
): Promise<ATSAnalysis> {
  // 1. Attempt OpenRouter Cloud LLM if configured
  if (process.env.OPENROUTER_API_KEY && process.env.USE_OPENROUTER === 'true') {
    try {
      const openRouterResult = await generateViaOpenRouter(profile, job);
      if (openRouterResult) {
        return openRouterResult;
      }
    } catch (err: any) {
      console.warn('[OpenRouter] LLM generation failed, falling back to deterministic ATS engine:', err.message);
    }
  }

  // 2. Intelligent Deterministic ATS Engine Fallback
  return generateIntelligentTailoredProfile(profile, job);
}

function generateIntelligentTailoredProfile(
  profile: CandidateProfile,
  job: JobListing
): ATSAnalysis {
  const { score, matchingKeywords, missingKeywords } = calculateATSScore(profile, job);
  const jdText = `${job.jobTitle || ''} ${job.descriptionText || ''}`.toLowerCase();

  const isAiRole = /ai|llm|mcp|model|machine learning|nlp|agent/i.test(jdText);
  const isBackendRole = /backend|api|database|microservices|nest|postgres|node/i.test(jdText);
  const isFrontendRole = /frontend|ui|ux|react|next|css|tailwind|design/i.test(jdText);

  // 1. Tailored Professional Summary
  let focusKeyword = 'full-stack SaaS architectures and modern web applications';
  if (isAiRole) {
    focusKeyword =
      'AI/MCP-integrated applications, Model Context Protocol workflows, and scalable full-stack platforms';
  } else if (isBackendRole) {
    focusKeyword =
      'scalable microservices, high-performance APIs (NestJS/Node.js), and cloud-native databases (PostgreSQL/GCP)';
  } else if (isFrontendRole) {
    focusKeyword =
      'high-performance Next.js (App Router, SSR/ISR) frontend systems and accessible headless CMS platforms';
  }

  const tailoredSummary = `Results-driven Software Engineer with 4 years of experience specializing in ${focusKeyword}. Proven track record delivering enterprise platform modernizations for premier institutions (Aga Khan University & Hospital), architecting multi-panel SaaS products (BoxBuy, Fair Trade), and deploying AI visual workflows (Transcend MCP). Expert at bridging modern frontend interfaces with robust cloud-native backends to reduce latency and accelerate product delivery.`;

  // 2. Fact-Locked & Re-ranked Skills
  const skillsCopy = JSON.parse(JSON.stringify(profile.skillCategories || []));
  if (isFrontendRole) {
    skillsCopy.sort((a: any, b: any) =>
      a.category?.includes('Frontend') ? -1 : b.category?.includes('Frontend') ? 1 : 0
    );
  } else if (isBackendRole) {
    skillsCopy.sort((a: any, b: any) =>
      a.category?.includes('Backend') ? -1 : b.category?.includes('Backend') ? 1 : 0
    );
  } else if (isAiRole) {
    skillsCopy.sort((a: any, b: any) =>
      a.category?.includes('AI') ? -1 : b.category?.includes('AI') ? 1 : 0
    );
  }

  // 3. Fact-Locked Experience Bullets (re-ordered by keyword density, facts strictly preserved)
  const tailoredExperiences = (profile.experiences || []).map((exp) => {
    const bullets = Array.isArray(exp.bullets) ? [...exp.bullets] : [];
    const sortedBullets = bullets.sort((a, b) => {
      const aMatches = matchingKeywords.filter((kw) =>
        a.toLowerCase().includes(kw.toLowerCase())
      ).length;
      const bMatches = matchingKeywords.filter((kw) =>
        b.toLowerCase().includes(kw.toLowerCase())
      ).length;
      return bMatches - aMatches;
    });

    return {
      company: exp.company || '',
      role: exp.role || '',
      period: exp.period || '',
      location: exp.location || '',
      bullets: sortedBullets.slice(0, 4) // Max 4 bullets per role for perfect layout
    };
  });

  // 4. Greeting Resolution & Cold Email Pitch
  const recipientGreeting = job.contactName
    ? `Hi ${job.contactName.split(' ')[0]},`
    : `Hi ${job.companyName} Team,`;

  const topMatchingHighlights =
    matchingKeywords.slice(0, 3).join(', ') || 'Next.js, Node.js, and Cloud Infrastructure';

  const isSpeculative =
    job.jobTitle.toLowerCase().includes('speculative') ||
    job.jobTitle.toLowerCase().includes('startup pitch') ||
    job.jobTitle.toLowerCase().includes('collaboration') ||
    job.descriptionText.length < 150;

  let coldEmailSubject = sanitizeSubject(
    `Software Engineer Application - ${job.jobTitle} - ${profile.name}`
  );

  let coldEmailBody = '';

  if (isSpeculative) {
    coldEmailSubject = sanitizeSubject(
      `Exploring Engineering Collaboration with ${job.companyName} — ${profile.name} (Full-Stack & Platform Architect)`
    );

    coldEmailBody = `${recipientGreeting}

I've been closely following what you're building at ${job.companyName}.

As a Full-Stack Engineer & Platform Architect specializing in ${topMatchingHighlights}, I wanted to reach out directly to explore if you're looking for high-leverage engineering support to accelerate feature delivery or scale your platform.

A quick snapshot of relevant platforms I've architected:
• Transcend (AI / MCP): Independently built an AI visual builder platform integrating Model Context Protocol (MCP) execution workflows and drag-and-drop canvas interactions.
• Aga Khan University & Hospital: Spearheaded enterprise web modernization using Next.js (App Router) + Storyblok Headless CMS for high-traffic multi-site delivery.
• BoxBuy (SaaS): Led distributed engineering to build a multi-tenant hospitality SaaS platform on GCP with Docker, cutting infrastructure costs by 35%.

Whether you are actively expanding the team or exploring autonomous builders for upcoming platform initiatives, I would love to connect and share ideas on how I can add immediate velocity to ${job.companyName}.

I have attached my resume for your review. Would you be open to a brief 10-minute introductory conversation this week?

Best regards,
${profile.name}
Portfolio: ${profile.portfolio || ''}
GitHub: ${profile.github || ''}
LinkedIn: ${profile.linkedin || ''}
Phone: ${profile.phone || ''}`;
  } else {
    coldEmailBody = `${recipientGreeting}

I came across ${job.companyName}'s opening for the ${job.jobTitle} position and wanted to reach out directly.

With 4 years of engineering experience architecting scalable platforms with ${topMatchingHighlights}, I have previously:
• Spearheaded enterprise web modernization for Aga Khan University & Hospital (Next.js App Router + Headless CMS).
• Led distributed engineering at Fair Trade to build multi-panel SaaS platforms, cutting cloud infrastructure costs by 35% on GCP.
• Architected Transcend, an AI visual builder integrated with Model Context Protocol (MCP) workflows.

I would love to bring this experience to ${job.companyName}. I have attached my tailored resume for your review. Would you be open to a brief 10-minute conversation this week?

Best regards,
${profile.name}
Portfolio: ${profile.portfolio || ''}
GitHub: ${profile.github || ''}
LinkedIn: ${profile.linkedin || ''}
Phone: ${profile.phone || ''}`;
  }

  // 5. Tailored Cover Letter (using dynamic candidate info)
  const coverLetter = `Dear Hiring Team at ${job.companyName},

I am writing to express my strong interest in the ${job.jobTitle} role at ${job.companyName}. With hands-on software engineering experience specializing in full-stack architecture, high-performance frontend systems (Next.js, React), and cloud microservices (Node.js, NestJS, GCP, Docker), I am eager to contribute to your engineering goals.

Throughout my career, I have consistently focused on building scalable, reliable systems that deliver measurable business impact:
- At Cloud Primero, I led the frontend architecture for the digital overhaul of Aga Khan University & Hospital, engineering high-traffic, SEO-optimized, and accessible platforms using Next.js App Router and Storyblok Headless CMS.
- As Lead Software Engineer at Fair Trade, I directed an engineering team in delivering BoxBuy—a comprehensive multi-panel SaaS platform—while optimizing GCP Docker containers to cut infrastructure expenses by 35% and automating CI/CD pipelines to speed up deployments by 5x.
- At Teksyo, I architected modular microservices that cut API latency by 45% and automated Python-driven data ingestion pipelines.

Your requirements for ${job.jobTitle} align closely with my technical background in ${topMatchingHighlights}. I pride myself on rapid execution, clean modular architecture, and autonomous problem-solving.

Thank you for your time and consideration. I welcome the opportunity to discuss how my skill set can support ${job.companyName}'s objectives.

Sincerely,
${profile.name}
${profile.email} | ${profile.phone}`;

  return {
    matchScore: score,
    matchingKeywords,
    missingKeywords,
    recommendedFocus: [focusKeyword],
    tailoredSummary,
    tailoredSkills: skillsCopy,
    tailoredExperiences,
    coldEmailSubject,
    coldEmailBody,
    coverLetter
  };
}

async function generateViaOpenRouter(
  profile: CandidateProfile,
  job: JobListing
): Promise<ATSAnalysis | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const model =
    process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.2-3b-instruct:free';

  const contactGreeting = job.contactName
    ? `Hi ${job.contactName.split(' ')[0]},`
    : `Hi ${job.companyName} Team,`;

  const systemPrompt = `You are an executive tech recruiter and expert ATS resume optimization engine.
Analyze the target job description and tailor the candidate's resume summary, highlight key matching skills, select top matching experience bullets, and write a high-converting 3-4 sentence cold email pitch + cover letter.
Ensure all facts remain 100% truthful to candidate's real experiences (Aga Khan University, Fair Trade, BoxBuy, Transcend MCP, Teksyo).

CRITICAL GREETING RULE:
Start the cold email with "${contactGreeting}". NEVER output literal brackets like "[Name/Team]" or "[Company]". Always use the real names.

Respond with valid JSON matching this schema:
{
  "matchScore": 9.5,
  "matchingKeywords": ["Next.js", "TypeScript", "Node.js"],
  "missingKeywords": [],
  "recommendedFocus": ["AI & Frontend"],
  "tailoredSummary": "A punchy 3-sentence professional summary tailored for this specific role and company...",
  "coldEmailSubject": "Software Engineer Application - ${job.jobTitle} - ${profile.name}",
  "coldEmailBody": "${contactGreeting}\\n\\n[3-4 high-impact sentences highlighting exact matching experience & metrics]\\n\\nBest regards,\\n${profile.name}",
  "coverLetter": "Full tailored cover letter starting with Dear Hiring Team at ${job.companyName}..."
}
Respond ONLY with raw JSON.`;

  const userPrompt = `Candidate Profile:
${JSON.stringify({
  name: profile.name,
  title: profile.title,
  summary: profile.summary,
  experiences: profile.experiences,
  keyProjects: profile.keyProjects,
  skills: profile.skillCategories
})}

Target Job Listing:
Company: ${job.companyName}
Role: ${job.jobTitle}
Description: ${(job.descriptionText || '').slice(0, 3000)}
Requirements: ${JSON.stringify(job.requirements || [])}`;

  let res: any;
  let retries = 1;
  let delayMs = 1000;

  while (retries > 0) {
    try {
      res = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://github.com/Abdurrahman-Hassan/project-jobfinder',
            'X-Title': 'JobFinder Pro',
            'Content-Type': 'application/json'
          },
          timeout: 4000,
          maxContentLength: 5 * 1024 * 1024,
          maxBodyLength: 5 * 1024 * 1024
        }
      );
      break;
    } catch (err: any) {
      if (err.response?.status === 429 && retries > 1) {
        retries--;
        console.warn(`[OpenRouter] Rate limited (429). Retrying in ${delayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2;
      } else {
        return null;
      }
    }
  }

  const content = res?.data?.choices?.[0]?.message?.content;
  if (!content) return null;

  const cleanJson = extractJsonFromText(content);
  if (!cleanJson) return null;

  let rawParsed: any;
  try {
    rawParsed = JSON.parse(cleanJson);
  } catch (err: any) {
    console.warn(`[OpenRouter] JSON parse error: ${err.message}`);
    return null;
  }

  // Zod Runtime Validation
  const validationResult = LLMOutputSchema.safeParse(rawParsed);
  if (!validationResult.success) {
    console.warn('[OpenRouter] LLM output failed schema validation:', validationResult.error.format());
    return null;
  }

  const parsed = validationResult.data;
  const baseProfile = generateIntelligentTailoredProfile(profile, job);

  // Strict Claim Verifier: Scan LLM generated free-text for unauthorized claims
  const forbiddenRegex = /phd|master's|10\+?\s*years|20\+?\s*years|stanford|mit|harvard/gi;
  let validatedSummary = parsed.tailoredSummary;
  let validatedCoverLetter = parsed.coverLetter;

  if (forbiddenRegex.test(validatedSummary)) {
    console.warn(`[LLM Guard] Hallucination detected in tailoredSummary. Falling back to deterministic summary.`);
    validatedSummary = baseProfile.tailoredSummary;
  }
  if (forbiddenRegex.test(validatedCoverLetter)) {
    console.warn(`[LLM Guard] Hallucination detected in coverLetter. Falling back to deterministic cover letter.`);
    validatedCoverLetter = baseProfile.coverLetter;
  }

  // Placeholder bracket sanitization for cold email and cover letter
  const contactNameResolved = job.contactName ? job.contactName.split(' ')[0] : `${job.companyName} Team`;
  
  let sanitizedColdBody = parsed.coldEmailBody
    .replace(/\[\s*(Name|Team|Name\/Team)\s*\]/gi, contactNameResolved)
    .replace(/\[\s*Company\s*\]/gi, job.companyName)
    .replace(/\[\s*Role\s*\]/gi, job.jobTitle);

  validatedCoverLetter = validatedCoverLetter
    .replace(/\[\s*(Name|Team|Name\/Team)\s*\]/gi, contactNameResolved)
    .replace(/\[\s*Company\s*\]/gi, job.companyName)
    .replace(/\[\s*Role\s*\]/gi, job.jobTitle);

  if (!sanitizedColdBody.trim().startsWith('Hi ') && !sanitizedColdBody.trim().startsWith('Dear ')) {
    sanitizedColdBody = `${contactGreeting}\n\n${sanitizedColdBody}`;
  }

  // Whitelist Guardrail: Ensure all matching keywords strictly exist in candidate's real skill profile
  const allVerifiedSkills = (profile.skillCategories || []).flatMap((c) =>
    (c.skills || []).map((s) => s.toLowerCase())
  );
  const rawLlmKeywords = Array.isArray(parsed.matchingKeywords) ? parsed.matchingKeywords : [];
  const whitelistedKeywords = rawLlmKeywords.filter((kw: string) =>
    allVerifiedSkills.some(
      (verified) =>
        verified.includes(kw.toLowerCase()) || kw.toLowerCase().includes(verified)
    )
  );

  return {
    ...baseProfile,
    matchScore: Math.min(10, Math.max(8.0, parsed.matchScore || 9.2)),
    matchingKeywords: whitelistedKeywords.length > 0 ? whitelistedKeywords : baseProfile.matchingKeywords,
    missingKeywords: parsed.missingKeywords.length > 0 ? parsed.missingKeywords : baseProfile.missingKeywords,
    recommendedFocus: parsed.recommendedFocus.length > 0 ? parsed.recommendedFocus : baseProfile.recommendedFocus,
    tailoredSummary: validatedSummary,
    coldEmailSubject: sanitizeSubject(parsed.coldEmailSubject || `Software Engineer - ${job.jobTitle} - ${profile.name}`),
    coldEmailBody: sanitizedColdBody,
    coverLetter: validatedCoverLetter,
    // Fact-Locked: Keep verified structured skills & experiences
    tailoredSkills: baseProfile.tailoredSkills,
    tailoredExperiences: baseProfile.tailoredExperiences
  };
}

// Helper: Extract JSON from LLM text with prefix/suffix protection
function extractJsonFromText(text: string): string | null {
  try {
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return text.slice(firstBrace, lastBrace + 1);
    }
  } catch {
    // ignore
  }
  return null;
}

// Helper: Sanitize Subject line from spam triggers and CRLF injection
function sanitizeSubject(subject: string): string {
  const cleaned = sanitizeHeaderString(subject);
  return cleaned
    .replace(/urgent|guaranteed|100%|free|winner|act now/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
