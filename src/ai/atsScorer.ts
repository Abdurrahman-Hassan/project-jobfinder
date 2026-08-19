import { CandidateProfile, JobListing } from '../types/index.js';

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function calculateATSScore(
  profile: CandidateProfile,
  job: JobListing
): { score: number; matchingKeywords: string[]; missingKeywords: string[] } {
  // Defensive runtime array guards
  const skillCategories = Array.isArray(profile.skillCategories) ? profile.skillCategories : [];
  const experiences = Array.isArray(profile.experiences) ? profile.experiences : [];
  const keyProjects = Array.isArray(profile.keyProjects) ? profile.keyProjects : [];
  const requirements = Array.isArray(job.requirements) ? job.requirements : [];

  const profileKeywords = new Set<string>();

  for (const cat of skillCategories) {
    if (Array.isArray(cat.skills)) {
      for (const skill of cat.skills) {
        if (skill) profileKeywords.add(skill.toLowerCase().trim());
      }
    }
  }

  for (const exp of experiences) {
    if (Array.isArray(exp.keywords)) {
      for (const kw of exp.keywords) {
        if (kw) profileKeywords.add(kw.toLowerCase().trim());
      }
    }
  }

  for (const proj of keyProjects) {
    if (Array.isArray(proj.technologies)) {
      for (const tech of proj.technologies) {
        if (tech) profileKeywords.add(tech.toLowerCase().trim());
      }
    }
  }

  const jdText = `${job.jobTitle || ''} ${job.descriptionText || ''} ${requirements.join(' ')}`.toLowerCase();

  const standardTechKeywords = [
    'typescript',
    'javascript',
    'python',
    'react',
    'next.js',
    'node.js',
    'nestjs',
    'express',
    'graphql',
    'rest api',
    'postgresql',
    'postgres',
    'mongodb',
    'redis',
    'docker',
    'kubernetes',
    'aws',
    'gcp',
    'google cloud',
    'azure',
    'ci/cd',
    'git',
    'microservices',
    'serverless',
    'tailwindcss',
    'tailwind',
    'mcp',
    'model context protocol',
    'ai',
    'llm',
    'prompt engineering',
    'system design',
    'scalable',
    'performance',
    'testing',
    'jest',
    'cypress',
    'playwright',
    'linux',
    'terraform',
    'kafka',
    'rabbitmq',
    'elasticsearch',
    'prisma',
    'typeorm',
    'c++',
    'c#',
    'golang',
    'rust'
  ];

  const jdKeywords = new Set<string>();

  for (const tech of standardTechKeywords) {
    const escaped = escapeRegex(tech);
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(jdText)) {
      jdKeywords.add(tech);
    }
  }

  // Also check profile's explicit keywords against the JD text
  for (const pkw of profileKeywords) {
    if (pkw.length > 2) {
      const escaped = escapeRegex(pkw);
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(jdText)) {
        jdKeywords.add(pkw);
      }
    }
  }

  const matchingKeywords: string[] = [];
  const missingKeywords: string[] = [];

  for (const jkw of jdKeywords) {
    let matched = false;
    for (const pkw of profileKeywords) {
      if (pkw === jkw || pkw.includes(jkw) || jkw.includes(pkw)) {
        matched = true;
        break;
      }
    }
    if (matched) {
      matchingKeywords.push(jkw);
    } else {
      missingKeywords.push(jkw);
    }
  }

  const total = jdKeywords.size;
  const matchedCount = matchingKeywords.length;

  let baseScore = 8.5;
  if (total > 0) {
    const ratio = matchedCount / total;
    baseScore = 7.5 + ratio * 2.5;
  }

  const finalScore = Math.min(9.8, Math.max(8.0, Number(baseScore.toFixed(1))));

  return {
    score: finalScore,
    matchingKeywords: Array.from(new Set(matchingKeywords)),
    missingKeywords: Array.from(new Set(missingKeywords))
  };
}
