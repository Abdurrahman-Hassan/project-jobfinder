import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { CandidateProfile } from '../types/index.js';

export async function parseResumeFileToProfile(filePath: string): Promise<CandidateProfile> {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const ext = path.extname(resolvedPath).toLowerCase();

  let rawText = '';

  if (ext === '.json') {
    const jsonContent = await fs.readFile(resolvedPath, 'utf-8');
    const parsed = JSON.parse(jsonContent);
    await saveProfileJson(parsed);
    return parsed;
  } else {
    // .txt, .md, or readable text
    rawText = await fs.readFile(resolvedPath, 'utf-8');
  }

  if (!rawText || rawText.trim().length === 0) {
    throw new Error(`Could not extract text from file: ${filePath}`);
  }

  // 1. Try parsing via OpenRouter / LLM if configured
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey && apiKey.trim().length > 10 && process.env.USE_OPENROUTER === 'true') {
    try {
      const llmProfile = await parseProfileWithLLM(rawText, apiKey);
      if (llmProfile) {
        await saveProfileJson(llmProfile);
        return llmProfile;
      }
    } catch (err: any) {
      console.warn('[Importer] LLM parsing failed, using rule-based parser:', err.message);
    }
  }

  // 2. Rule-Based Fallback Parser
  const structuredProfile = parseProfileRuleBased(rawText);
  await saveProfileJson(structuredProfile);
  return structuredProfile;
}

async function saveProfileJson(profile: CandidateProfile): Promise<void> {
  const targetPath = path.resolve(process.cwd(), 'src', 'config', 'profile.json');
  await fs.writeFile(targetPath, JSON.stringify(profile, null, 2), 'utf-8');
}

async function parseProfileWithLLM(
  resumeText: string,
  apiKey: string
): Promise<CandidateProfile | null> {
  const model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.2-3b-instruct:free';

  const systemPrompt = `You are an expert HR data engineer. Parse the raw resume text into a structured JSON profile matching this exact schema:
{
  "name": "Full Name",
  "title": "Primary Title",
  "location": "City, Country",
  "phone": "+...",
  "email": "...",
  "linkedin": "https://linkedin.com/in/...",
  "github": "https://github.com/...",
  "portfolio": "https://...",
  "summary": "Professional summary...",
  "skillCategories": [
    { "category": "Languages", "skills": ["TypeScript", "Python"] },
    { "category": "Frontend", "skills": ["Next.js", "React"] },
    { "category": "Backend", "skills": ["Node.js", "PostgreSQL"] }
  ],
  "experiences": [
    {
      "id": "company-slug",
      "company": "Company Name",
      "location": "Location",
      "role": "Role Title",
      "period": "Start – End",
      "keywords": ["React", "Next.js"],
      "bullets": ["Bullet 1 with metrics...", "Bullet 2..."]
    }
  ],
  "keyProjects": [
    {
      "name": "Project Name",
      "tagline": "Short tagline",
      "description": "Description...",
      "technologies": ["Tech 1", "Tech 2"]
    }
  ],
  "education": [
    {
      "degree": "Degree Title",
      "institution": "University / College"
    }
  ],
  "certifications": ["Certification 1", "Certification 2"]
}
Respond ONLY with raw JSON.`;

  const res = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: resumeText.slice(0, 8000) }
      ],
      temperature: 0.1
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/Abdurrahman-Hassan/project-jobfinder',
        'X-Title': 'JobFinder Pro',
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );

  const content = res.data?.choices?.[0]?.message?.content;
  if (!content) return null;

  const cleanJson = content
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  return JSON.parse(cleanJson);
}

function parseProfileRuleBased(rawText: string): CandidateProfile {
  const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const name = lines[0] || 'Software Engineer Candidate';

  const emailMatch = rawText.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
  const phoneMatch = rawText.match(/(\+?\d[\d\s-]{8,}\d)/);
  const linkedinMatch = rawText.match(/(https?:\/\/(www\.)?linkedin\.com\/in\/[^\s]+)/i);
  const githubMatch = rawText.match(/(https?:\/\/(www\.)?github\.com\/[^\s]+)/i);
  const portfolioMatch = rawText.match(/(https?:\/\/[a-zA-Z0-9.-]+\.(app|dev|io|netlify\.app|vercel\.app))/i);

  // Extract skills
  const skillsList = ['TypeScript', 'JavaScript', 'Next.js', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'Python', 'AWS', 'GCP'];
  const matchedSkills = skillsList.filter((s) => new RegExp(`\\b${s}\\b`, 'i').test(rawText));

  return {
    name,
    title: lines[1] && lines[1].length < 50 ? lines[1] : 'Software Engineer',
    location: 'Remote',
    phone: phoneMatch ? phoneMatch[1] : '',
    email: emailMatch ? emailMatch[1] : '',
    linkedin: linkedinMatch ? linkedinMatch[1] : '',
    github: githubMatch ? githubMatch[1] : '',
    portfolio: portfolioMatch ? portfolioMatch[1] : '',
    summary: lines.slice(1, 4).join(' '),
    skillCategories: [
      {
        category: 'Technical Skills',
        skills: matchedSkills.length > 0 ? matchedSkills : ['TypeScript', 'Next.js', 'Node.js', 'PostgreSQL']
      }
    ],
    experiences: [
      {
        id: 'exp-1',
        company: 'Software Company',
        location: 'Remote',
        role: 'Software Engineer',
        period: '2022 – Present',
        keywords: ['Full-Stack', 'TypeScript'],
        bullets: lines.slice(4, 8)
      }
    ],
    keyProjects: [],
    education: [],
    certifications: []
  };
}
