import { CandidateProfile, JobListing } from '../types/index.js';

export function calculateATSScore(
  profile: CandidateProfile,
  job: JobListing
): {
  score: number;
  matchingKeywords: string[];
  missingKeywords: string[];
} {
  const jdText = `${job.jobTitle} ${job.descriptionText} ${job.requirements.join(' ')}`.toLowerCase();

  // All skills and keywords from profile
  const allProfileSkills: string[] = [];
  for (const cat of profile.skillCategories) {
    allProfileSkills.push(...cat.skills);
  }
  for (const exp of profile.experiences) {
    allProfileSkills.push(...exp.keywords);
  }
  for (const proj of profile.keyProjects) {
    allProfileSkills.push(...proj.technologies);
  }

  // Canonicalize list
  const uniqueCandidateKeywords = Array.from(new Set(allProfileSkills));

  // Common tech dictionary to scan for in JD
  const techKeywordsDictionary = [
    'typescript',
    'javascript',
    'react',
    'react.js',
    'next.js',
    'nextjs',
    'node.js',
    'nodejs',
    'nestjs',
    'express',
    'fastify',
    'python',
    'sql',
    'postgresql',
    'postgres',
    'supabase',
    'mongodb',
    'redis',
    'docker',
    'gcp',
    'aws',
    'cloud run',
    'ec2',
    's3',
    'lambda',
    'microservices',
    'rest',
    'restful',
    'graphql',
    'tailwind',
    'tailwind css',
    'storyblok',
    'headless cms',
    'ci/cd',
    'github actions',
    'playwright',
    'jest',
    'mcp',
    'model context protocol',
    'llm',
    'openai',
    'saas',
    'e-commerce',
    'seo',
    'ssr',
    'performance',
    'leadership',
    'lead',
    'agile'
  ];

  const jdMatchedTech: string[] = [];
  for (const kw of techKeywordsDictionary) {
    const regex = new RegExp(`\\b${kw.replace('.', '\\.')}\\b`, 'i');
    if (regex.test(jdText)) {
      jdMatchedTech.push(kw);
    }
  }

  const matching: string[] = [];
  const missing: string[] = [];

  for (const tech of jdMatchedTech) {
    const isPresentInProfile = uniqueCandidateKeywords.some((skill) =>
      skill.toLowerCase().includes(tech.toLowerCase())
    );
    if (isPresentInProfile) {
      matching.push(tech);
    } else {
      missing.push(tech);
    }
  }

  // Score Calculation
  let baseScore = 7.0;
  if (jdMatchedTech.length > 0) {
    const ratio = matching.length / jdMatchedTech.length;
    baseScore = 7.5 + ratio * 2.5; // Scale between 7.5 and 10.0
  }

  const finalScore = Math.min(9.8, Math.max(8.2, Number(baseScore.toFixed(1))));

  return {
    score: finalScore,
    matchingKeywords: Array.from(new Set(matching)),
    missingKeywords: Array.from(new Set(missing))
  };
}
