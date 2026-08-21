import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { CandidateProfile } from '../types/index.js';

export const EMPTY_PROFILE: CandidateProfile = {
  name: '',
  title: '',
  location: '',
  phone: '',
  email: '',
  secondaryEmail: '',
  linkedin: '',
  github: '',
  portfolio: '',
  summary: '',
  skillCategories: [],
  experiences: [],
  keyProjects: [],
  education: [],
  certifications: []
};

export const DEFAULT_PROFILE = EMPTY_PROFILE;

/**
 * Checks if a valid candidate profile is present.
 */
export function isProfileConfigured(): boolean {
  try {
    const jsonPath = path.resolve(process.cwd(), 'src', 'config', 'profile.json');
    if (fs.existsSync(jsonPath)) {
      const data = fs.readFileSync(jsonPath, 'utf-8');
      const parsed = JSON.parse(data);
      return Boolean(parsed && parsed.name && parsed.name.trim().length > 0 && parsed.email && parsed.email.trim().length > 0);
    }
  } catch {}
  return false;
}

/**
 * Retrieves the active candidate profile.
 * Throws a helpful onboarding message if not configured.
 */
export function getActiveProfile(): CandidateProfile {
  try {
    const jsonPath = path.resolve(process.cwd(), 'src', 'config', 'profile.json');
    if (fs.existsSync(jsonPath)) {
      const data = fs.readFileSync(jsonPath, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed && parsed.name && parsed.name.trim().length > 0) {
        return parsed;
      }
    }
  } catch {}
  return EMPTY_PROFILE;
}

/**
 * Enforces that candidate profile exists before running job search, tailoring, or applying.
 * Displays helpful instructions if missing.
 */
export function ensureProfileConfigured(): CandidateProfile {
  const profile = getActiveProfile();
  if (!profile.name || profile.name.trim().length === 0 || !profile.email) {
    console.log(chalk.bold.red('\n❌ No Candidate Profile Found!\n'));
    console.log(chalk.yellow('JobFinder Pro needs your resume / candidate details to tailor applications and auto-fill forms.\n'));
    console.log(chalk.bold.cyan('👉 Quick Setup Options:\n'));
    console.log(`  ${chalk.bold('Option 1: Auto-Import from PDF (Recommended)')}`);
    console.log(`    Put your resume PDF into the ${chalk.green('resumes/')} folder and run:`);
    console.log(chalk.bold.green('    npm run import-cv\n'));
    console.log(`    Or pass your PDF path directly:`);
    console.log(chalk.bold.green('    npm run import-cv -- path/to/your_resume.pdf\n'));
    console.log(`  ${chalk.bold('Option 2: Configure via JSON')}`);
    console.log(`    Copy the example template and edit your details:`);
    console.log(chalk.bold.green('    cp src/config/profile.example.json src/config/profile.json\n'));
    console.log(chalk.gray('For full workflow advice and cheatsheet, run: npm run guide\n'));
    process.exit(1);
  }
  return profile;
}

export const MASTER_PROFILE = getActiveProfile();
