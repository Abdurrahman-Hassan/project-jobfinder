import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { PDFParse } from 'pdf-parse';
import { CandidateProfile } from '../types/index.js';
import { DEFAULT_PROFILE } from '../config/profile.js';
import { CandidateProfileSchema } from '../validation/schemas.js';
import { callUniversalLLM } from '../ai/llmSearchOrchestrator.js';

export async function parseResumeFileToProfile(filePath: string): Promise<CandidateProfile> {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Resume file not found at: ${resolvedPath}`);
  }

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
        throw new Error(`Invalid candidate profile JSON: ${JSON.stringify(validation.error.format())}`);
      }
      await saveProfileJson(validation.data);
      return validation.data;
    } catch (err: any) {
      throw new Error(`Failed to parse profile JSON: ${err.message}`);
    }
  }

  // 2. High-Accuracy AI Extraction
  try {
    const llmProfile = await parseProfileWithUniversalAI(fileContent);
    if (llmProfile) {
      await saveProfileJson(llmProfile);
      return llmProfile;
    }
  } catch (err: any) {
    console.warn(chalk.yellow(`  [AI Resume Parser Fallback] ${err.message}`));
  }

  // 3. Robust Heuristic / Section-Aware Parser Fallback
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
 * If a PDF, JSON, TXT, or MD resume exists, loads or re-parses it automatically if modified.
 */
export async function autoLoadResumeFromFolder(): Promise<CandidateProfile> {
  const resumesDir = path.resolve(process.cwd(), 'resumes');
  if (!fs.existsSync(resumesDir)) {
    fs.mkdirSync(resumesDir, { recursive: true });
  }

  const files = fs.readdirSync(resumesDir).filter((f) => {
    if (f.toLowerCase().startsWith('readme')) return false;
    const ext = path.extname(f).toLowerCase();
    return ['.pdf', '.json', '.txt', '.md'].includes(ext);
  });

  const profileJsonPath = path.resolve(process.cwd(), 'src', 'config', 'profile.json');

  // If no resume in resumes/ folder, check if cached profile.json exists
  if (files.length === 0) {
    if (fs.existsSync(profileJsonPath)) {
      try {
        return JSON.parse(fs.readFileSync(profileJsonPath, 'utf-8'));
      } catch {}
    }
    return DEFAULT_PROFILE;
  }

  // Find most recently modified resume file in resumes/
  let latestFile = files[0];
  let latestMtime = 0;
  for (const f of files) {
    const s = fs.statSync(path.join(resumesDir, f));
    if (s.mtimeMs > latestMtime) {
      latestMtime = s.mtimeMs;
      latestFile = f;
    }
  }

  const fullPath = path.join(resumesDir, latestFile);

  // Check if profile.json already exists and is NEWER than the resume file
  if (fs.existsSync(profileJsonPath)) {
    const profileStats = fs.statSync(profileJsonPath);
    if (profileStats.mtimeMs >= latestMtime) {
      try {
        const cached = JSON.parse(fs.readFileSync(profileJsonPath, 'utf-8'));
        return cached;
      } catch {
        // re-parse if corrupted
      }
    }
  }

  console.log(chalk.bold.magenta(`\n📄 Detected new or updated resume in "resumes/": ${latestFile}`));
  console.log(chalk.gray(`  • Parsing and extracting candidate profile...`));

  try {
    const loadedProfile = await parseResumeFileToProfile(fullPath);
    console.log(chalk.bold.green(`✓ Profile for "${loadedProfile.name}" successfully parsed & cached to src/config/profile.json!\n`));
    return loadedProfile;
  } catch (err: any) {
    console.warn(chalk.yellow(`[Resume Auto-Load Warning] ${err.message}`));
    if (fs.existsSync(profileJsonPath)) {
      try {
        return JSON.parse(fs.readFileSync(profileJsonPath, 'utf-8'));
      } catch {}
    }
    return DEFAULT_PROFILE;
  }
}

async function parseProfileWithUniversalAI(
  resumeText: string
): Promise<CandidateProfile | null> {
  const systemPrompt = `You are an expert HR intelligence parser. Extract a clean candidate profile matching this exact JSON schema:
{
  "name": "Full Name",
  "title": "Professional Title",
  "location": "City, Country",
  "phone": "Phone number",
  "email": "Email address",
  "linkedin": "LinkedIn URL",
  "github": "GitHub URL",
  "portfolio": "Portfolio URL",
  "summary": "3-4 sentence professional summary",
  "skillCategories": [
    { "category": "Languages", "skills": ["TypeScript", "Python"] },
    { "category": "Frontend", "skills": ["Next.js", "React"] },
    { "category": "Backend", "skills": ["Node.js", "NestJS"] },
    { "category": "Databases", "skills": ["PostgreSQL", "Supabase"] },
    { "category": "Cloud & DevOps", "skills": ["GCP", "Docker"] }
  ],
  "experiences": [
    {
      "id": "company-slug",
      "company": "Company Name",
      "location": "Location",
      "role": "Job Title",
      "period": "Period (e.g. Dec 2025 - Present)",
      "bullets": ["Achievement 1", "Achievement 2"],
      "keywords": ["Next.js", "TypeScript"]
    }
  ],
  "keyProjects": [
    {
      "name": "Project Name",
      "tagline": "Short tagline",
      "description": "Description",
      "technologies": ["Next.js", "MCP"]
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "institution": "Institution Name"
    }
  ],
  "certifications": ["Certification 1"]
}
Respond with valid raw JSON only.`;

  const userPrompt = `Resume Content:\n${resumeText.slice(0, 4000)}`;

  const raw = await callUniversalLLM(systemPrompt, userPrompt);
  if (!raw) return null;

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) return null;

  try {
    const cleanJson = raw.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(cleanJson);
    const validated = CandidateProfileSchema.safeParse(parsed);
    if (validated.success) {
      return validated.data;
    }
  } catch {}

  return null;
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
