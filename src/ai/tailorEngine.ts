import axios from 'axios';
import { CandidateProfile, JobListing, ATSAnalysis } from '../types/index.js';
import { calculateATSScore } from './atsScorer.js';

export async function generateTailoredApplication(
  profile: CandidateProfile,
  job: JobListing
): Promise<ATSAnalysis> {
  // 1. Check if user configured OpenRouter Free/Paid Model
  if (process.env.OPENROUTER_API_KEY && process.env.USE_OPENROUTER === 'true') {
    try {
      const openRouterResult = await generateViaOpenRouter(profile, job);
      if (openRouterResult) {
        return openRouterResult;
      }
    } catch (err: any) {
      console.warn('[OpenRouter] LLM generation failed, falling back to intelligent ATS engine:', err.message);
    }
  }

  // 2. Check if user requested Ollama local LLM
  if (process.env.USE_OLLAMA === 'true' && process.env.OLLAMA_BASE_URL) {
    try {
      const ollamaResult = await generateViaOllama(profile, job);
      if (ollamaResult) return ollamaResult;
    } catch (err: any) {
      console.warn('[Ollama] Local LLM failed, using intelligent built-in tailor:', err.message);
    }
  }

  return generateIntelligentTailoredProfile(profile, job);
}

function generateIntelligentTailoredProfile(
  profile: CandidateProfile,
  job: JobListing
): ATSAnalysis {
  const { score, matchingKeywords, missingKeywords } = calculateATSScore(profile, job);
  const jdText = `${job.jobTitle} ${job.descriptionText}`.toLowerCase();

  const isAiRole = /ai|llm|mcp|model|machine learning|nlp|agent/i.test(jdText);
  const isBackendRole = /backend|api|database|microservices|nest|postgres|node/i.test(jdText);
  const isFrontendRole = /frontend|ui|ux|react|next|css|tailwind|design/i.test(jdText);
  const isLeadRole = /lead|architect|staff|principal|head/i.test(job.jobTitle.toLowerCase());

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

  // 2. Tailored Skills (re-order categories based on JD focus)
  const skillsCopy = JSON.parse(JSON.stringify(profile.skillCategories));
  if (isFrontendRole) {
    skillsCopy.sort((a: any, b: any) =>
      a.category.includes('Frontend') ? -1 : b.category.includes('Frontend') ? 1 : 0
    );
  } else if (isBackendRole) {
    skillsCopy.sort((a: any, b: any) =>
      a.category.includes('Backend') ? -1 : b.category.includes('Backend') ? 1 : 0
    );
  } else if (isAiRole) {
    skillsCopy.sort((a: any, b: any) =>
      a.category.includes('AI') ? -1 : b.category.includes('AI') ? 1 : 0
    );
  }

  // 3. Tailored Experience Bullets (re-order matching points to the top)
  const tailoredExperiences = profile.experiences.map((exp) => {
    const sortedBullets = [...exp.bullets].sort((a, b) => {
      const aMatches = matchingKeywords.filter((kw) =>
        a.toLowerCase().includes(kw.toLowerCase())
      ).length;
      const bMatches = matchingKeywords.filter((kw) =>
        b.toLowerCase().includes(kw.toLowerCase())
      ).length;
      return bMatches - aMatches;
    });

    return {
      company: exp.company,
      role: exp.role,
      period: exp.period,
      location: exp.location,
      bullets: sortedBullets
    };
  });

  // 4. Short, High-Impact Cold Email Pitch
  const recipientGreeting = job.contactName
    ? `Hi ${job.contactName.split(' ')[0]},`
    : `Hi ${job.companyName} Team,`;

  const topMatchingHighlights =
    matchingKeywords.slice(0, 3).join(', ') || 'Next.js, Node.js, and Cloud Infrastructure';

  const coldEmailSubject = `Software Engineer Application - ${job.jobTitle} - Abdurrahman Hassan`;
  const coldEmailBody = `${recipientGreeting}

I came across ${job.companyName}'s opening for the ${job.jobTitle} position and wanted to reach out directly.

With 4 years of engineering experience architecting scalable platforms with ${topMatchingHighlights}, I have previously:
• Spearheaded enterprise web modernization for Aga Khan University & Hospital (Next.js App Router + Headless CMS).
• Led distributed engineering at Fair Trade to build multi-panel SaaS platforms, cutting cloud infrastructure costs by 35% on GCP.
• Architected Transcend, an AI visual builder integrated with Model Context Protocol (MCP) workflows.

I would love to bring this experience to ${job.companyName}. I have attached my tailored resume for your review. Would you be open to a brief 10-minute conversation this week?

Best regards,
Abdurrahman Hassan
Portfolio: https://abdurrahmanhassan.netlify.app
GitHub: https://github.com/Abdurrahman-Hassan
LinkedIn: https://linkedin.com/in/abdurrahman-hassan
Phone: +92 3112910773`;

  // 5. Tailored Cover Letter
  const coverLetter = `Dear Hiring Team at ${job.companyName},

I am writing to express my strong interest in the ${job.jobTitle} role at ${job.companyName}. With over 4 years of hands-on software engineering experience specializing in full-stack architecture, high-performance frontend systems (Next.js, React), and cloud microservices (Node.js, NestJS, GCP, Docker), I am eager to contribute to your engineering goals.

Throughout my career, I have consistently focused on building scalable, reliable systems that deliver measurable business impact:
- At Cloud Primero, I led the frontend architecture for the digital overhaul of Aga Khan University & Hospital, engineering high-traffic, SEO-optimized, and accessible platforms using Next.js App Router and Storyblok Headless CMS.
- As Lead Software Engineer at Fair Trade (Poland), I directed an engineering team in delivering BoxBuy—a comprehensive multi-panel SaaS platform—while optimizing GCP Docker containers to cut infrastructure expenses by 35% and automating CI/CD pipelines to speed up deployments by 5x.
- At Teksyo, I architected modular microservices that cut API latency by 45% and automated Python-driven data ingestion pipelines.

Your requirements for ${job.jobTitle} align closely with my technical background in ${topMatchingHighlights}. I pride myself on rapid execution, clean modular architecture, and autonomous problem-solving.

Thank you for your time and consideration. I welcome the opportunity to discuss how my skill set can support ${job.companyName}'s objectives.

Sincerely,
Abdurrahman Hassan
abdurfreelance@gmail.com | +92 3112910773`;

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

  // Free models on OpenRouter (e.g. meta-llama/llama-3.2-3b-instruct:free, google/gemini-2.0-flash-exp:free, qwen/qwen-2.5-coder-32b-instruct:free, deepseek/deepseek-r1:free)
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
  "coldEmailSubject": "Software Engineer Application - ${job.jobTitle} - Abdurrahman Hassan",
  "coldEmailBody": "${contactGreeting}\\n\\n[3-4 high-impact sentences highlighting exact matching experience & metrics]\\n\\nBest regards,\\nAbdurrahman Hassan",
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
Description: ${job.descriptionText.slice(0, 3000)}
Requirements: ${JSON.stringify(job.requirements)}`;

  const res = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/Abdurrahman-Hassan/project-jobfinder',
        'X-Title': 'JobFinder Pro',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  );

  const content = res.data?.choices?.[0]?.message?.content;
  if (!content) return null;

  // Clean markdown code fence if present
  const cleanJson = content
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const parsed = JSON.parse(cleanJson);
  const baseProfile = generateIntelligentTailoredProfile(profile, job);

  // Sanitize any remaining placeholder brackets
  let sanitizedColdBody = (parsed.coldEmailBody || '')
    .replace(/\[\s*(Name|Team|Name\/Team)\s*\]/gi, job.contactName ? job.contactName.split(' ')[0] : `${job.companyName} Team`)
    .replace(/\[\s*Company\s*\]/gi, job.companyName)
    .replace(/\[\s*Role\s*\]/gi, job.jobTitle);

  if (!sanitizedColdBody.trim().startsWith('Hi ') && !sanitizedColdBody.trim().startsWith('Dear ')) {
    sanitizedColdBody = `${contactGreeting}\n\n${sanitizedColdBody}`;
  }

  return {
    ...baseProfile,
    ...parsed,
    coldEmailBody: sanitizedColdBody,
    matchScore: Math.min(10, Math.max(8.0, Number(parsed.matchScore) || 9.2)),
    tailoredSkills: baseProfile.tailoredSkills,
    tailoredExperiences: baseProfile.tailoredExperiences
  };
}

async function generateViaOllama(
  profile: CandidateProfile,
  job: JobListing
): Promise<ATSAnalysis | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'llama3.2';

  const prompt = `You are an expert ATS resume optimizer and executive tech recruiter.
Candidate Profile:
${JSON.stringify(profile)}

Target Job Listing:
Title: ${job.jobTitle}
Company: ${job.companyName}
Description: ${job.descriptionText}
Requirements: ${JSON.stringify(job.requirements)}

Task:
Generate a tailored resume adjustment with match score >= 8.5/10, professional summary, tailored cold email, and cover letter in JSON format matching this schema:
{
  "matchScore": 8.8,
  "matchingKeywords": ["Next.js", "TypeScript", "Microservices"],
  "missingKeywords": [],
  "recommendedFocus": ["Frontend Optimization"],
  "tailoredSummary": "...",
  "coldEmailSubject": "...",
  "coldEmailBody": "...",
  "coverLetter": "..."
}
Respond ONLY with raw JSON.`;

  const res = await axios.post(
    `${baseUrl}/api/generate`,
    {
      model,
      prompt,
      stream: false,
      format: 'json'
    },
    { timeout: 30000 }
  );

  if (res.data && res.data.response) {
    const parsed = JSON.parse(res.data.response);
    const intelligentFallback = generateIntelligentTailoredProfile(profile, job);
    return {
      ...intelligentFallback,
      ...parsed,
      tailoredSkills: intelligentFallback.tailoredSkills,
      tailoredExperiences: intelligentFallback.tailoredExperiences
    };
  }

  return null;
}
