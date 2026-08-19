import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import axios from 'axios';
import chalk from 'chalk';
import { PDFParse } from 'pdf-parse';
import { CandidateProfile } from '../types/index.js';
import { DEFAULT_PROFILE } from '../config/profile.js';
import { CandidateProfileSchema } from '../validation/schemas.js';

export async function parseResumeFileToProfile(filePath: string): Promise<CandidateProfile> {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const ext = path.extname(resolvedPath).toLowerCase();

  let fileContent = '';

  if (ext === '.pdf') {
    const dataBuffer = await fsp.readFile(resolvedPath);
    const parser = new PDFParse({ data: dataBuffer });
    const parsedPdf = await parser.getText();
    fileContent = parsedPdf.text || '';
  } else {
    fileContent = await fsp.readFile(resolvedPath, 'utf-8');
  }

  if (!fileContent.trim()) {
    throw new Error(`The provided resume file at ${resolvedPath} is empty.`);
  }

  // 1. JSON Profile with Zod Schema Validation
  if (ext === '.json') {
    try {
      const parsed = JSON.parse(fileContent);
      const validation = CandidateProfileSchema.safeParse(parsed);
      if (!validation.success) {
        throw new Error(`Invalid candidate profile JSON format: ${JSON.stringify(validation.error.format())}`);
      }
      await saveProfileJson(validation.data);
      return validation.data;
    } catch (err: any) {
      throw new Error(`Failed to parse profile JSON: ${err.message}`);
    }
  }

  // 2. Fast LLM Extraction with Strict 4s Timeout
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey && apiKey.length > 10) {
    try {
      const llmProfile = await parseProfileWithLLM(fileContent, apiKey);
      if (llmProfile) {
        await saveProfileJson(llmProfile);
        return llmProfile;
      }
    } catch {
      // fallback to fast rule-based extractor
    }
  }

  // 3. Instant Deterministic / Rule-Based Parsing Fallback
  const ruleProfile = parseProfileRuleBased(fileContent);
  await saveProfileJson(ruleProfile);
  return ruleProfile;
}

export async function saveProfileJson(profile: CandidateProfile): Promise<void> {
  const configDir = path.resolve(process.cwd(), 'src', 'config');
  await fsp.mkdir(configDir, { recursive: true });
  const profileJsonPath = path.join(configDir, 'profile.json');
  await fsp.writeFile(profileJsonPath, JSON.stringify(profile, null, 2), 'utf-8');
}

/**
 * Automatically inspects the "resumes/" folder.
 * If a PDF, JSON, TXT, or MD resume exists, loads and updates profile.json automatically.
 */
export async function autoLoadResumeFromFolder(): Promise<CandidateProfile | null> {
  const resumesDir = path.resolve(process.cwd(), 'resumes');
  if (!fs.existsSync(resumesDir)) {
    fs.mkdirSync(resumesDir, { recursive: true });
    return null;
  }

  const files = fs.readdirSync(resumesDir).filter((f) => {
    if (f.toLowerCase().startsWith('readme')) return false;
    const ext = path.extname(f).toLowerCase();
    return ['.pdf', '.json', '.txt', '.md'].includes(ext);
  });

  if (files.length === 0) {
    return null;
  }

  // Pick the newest or primary file in resumes/
  const primaryFile = files[0];
  const fullPath = path.join(resumesDir, primaryFile);
  const stats = fs.statSync(fullPath);

  // Check if profile.json already exists and is newer than the resume file
  const profileJsonPath = path.resolve(process.cwd(), 'src', 'config', 'profile.json');
  if (fs.existsSync(profileJsonPath)) {
    const profileStats = fs.statSync(profileJsonPath);
    if (profileStats.mtimeMs >= stats.mtimeMs) {
      try {
        const cached = JSON.parse(fs.readFileSync(profileJsonPath, 'utf-8'));
        return cached;
      } catch {
        // re-parse if corrupted
      }
    }
  }

  console.log(chalk.bold.magenta(`\n📄 Auto-detected base resume in "resumes/": ${primaryFile}`));
  try {
    const loadedProfile = await parseResumeFileToProfile(fullPath);
    console.log(chalk.green(`✓ Profile for "${loadedProfile.name}" loaded and cached!`));
    return loadedProfile;
  } catch (err: any) {
    console.warn(chalk.yellow(`[Resume Auto-Load Warning] ${err.message}`));
    return null;
  }
}

async function parseProfileWithLLM(
  resumeText: string,
  apiKey: string
): Promise<CandidateProfile | null> {
  const model = 'meta-llama/llama-3.2-3b-instruct:free';

  const systemPrompt = `You are an expert HR parser. Extract JSON matching candidate profile schema from resume.
Schema structure:
{
  "name": "Full Name",
  "title": "Professional Title",
  "location": "City, Country",
  "phone": "Phone number",
  "email": "Email address",
  "linkedin": "LinkedIn URL",
  "github": "GitHub URL",
  "portfolio": "Portfolio URL",
  "summary": "Professional summary",
  "skillCategories": [
    { "category": "Category Name", "skills": ["Skill1", "Skill2"] }
  ],
  "experiences": [
    {
      "id": "unique-id",
      "company": "Company Name",
      "location": "Location",
      "role": "Role Title",
      "period": "Start - End",
      "bullets": ["Bullet 1", "Bullet 2"],
      "keywords": ["Keyword1", "Keyword2"]
    }
  ],
  "keyProjects": [
    {
      "name": "Project Name",
      "tagline": "Short tagline",
      "description": "Description",
      "technologies": ["Tech1", "Tech2"]
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "institution": "Institution Name"
    }
  ],
  "certifications": ["Cert 1"]
}
Respond with raw JSON only.`;

  const res = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Resume Content:\n${resumeText.slice(0, 3000)}` }
      ],
      temperature: 0.1
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 4000,
      maxContentLength: 5 * 1024 * 1024,
      maxBodyLength: 5 * 1024 * 1024
    }
  );

  const content = res.data?.choices?.[0]?.message?.content;
  if (!content) return null;

  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) return null;

  try {
    const cleanJson = content.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(cleanJson);
    const validated = CandidateProfileSchema.safeParse(parsed);
    if (validated.success) {
      return validated.data;
    }
    return null;
  } catch {
    return null;
  }
}

function parseProfileRuleBased(rawText: string): CandidateProfile {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const name = lines[0] || DEFAULT_PROFILE.name;
  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = rawText.match(/(\+?\d[\d\s-]{8,}\d)/);
  const linkedinMatch = rawText.match(/https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/);
  const githubMatch = rawText.match(/https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+/);
  const portfolioMatch = rawText.match(/https?:\/\/[a-zA-Z0-9.-]+\.(app|io|dev|netlify\.app|vercel\.app|me)/);

  return {
    ...DEFAULT_PROFILE,
    name,
    email: emailMatch ? emailMatch[0] : DEFAULT_PROFILE.email,
    phone: phoneMatch ? phoneMatch[0] : DEFAULT_PROFILE.phone,
    linkedin: linkedinMatch ? linkedinMatch[0] : DEFAULT_PROFILE.linkedin,
    github: githubMatch ? githubMatch[0] : DEFAULT_PROFILE.github,
    portfolio: portfolioMatch ? portfolioMatch[0] : DEFAULT_PROFILE.portfolio,
    summary: lines.slice(1, 4).join(' ') || DEFAULT_PROFILE.summary
  };
}
