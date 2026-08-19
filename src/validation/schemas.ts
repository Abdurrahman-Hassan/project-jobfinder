import { z } from 'zod';

export const SkillCategorySchema = z.object({
  category: z.string().min(1),
  skills: z.array(z.string().min(1)).min(1)
});

export const ExperienceItemSchema = z.object({
  id: z.string().min(1),
  company: z.string().min(1),
  location: z.string().min(1),
  role: z.string().min(1),
  period: z.string().min(1),
  bullets: z.array(z.string()).min(1),
  keywords: z.array(z.string())
});

export const ProjectItemSchema = z.object({
  name: z.string().min(1),
  tagline: z.string(),
  description: z.string().min(1),
  technologies: z.array(z.string()),
  url: z.string().optional()
});

export const EducationItemSchema = z.object({
  degree: z.string().min(1),
  institution: z.string().min(1),
  location: z.string().optional(),
  finalYearProject: z.string().optional()
});

export const CandidateProfileSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  location: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email(),
  secondaryEmail: z.string().email().optional(),
  linkedin: z.string(),
  github: z.string(),
  portfolio: z.string(),
  summary: z.string().min(1),
  skillCategories: z.array(SkillCategorySchema).min(1),
  experiences: z.array(ExperienceItemSchema).min(1),
  keyProjects: z.array(ProjectItemSchema),
  education: z.array(EducationItemSchema),
  certifications: z.array(z.string())
});

export const JobListingSchema = z.object({
  url: z.string().url(),
  companyName: z.string().min(1),
  companyDomain: z.string().optional(),
  jobTitle: z.string().min(1),
  location: z.string().optional(),
  department: z.string().optional(),
  descriptionText: z.string().min(1),
  requirements: z.array(z.string()),
  contactEmail: z.string().email().optional(),
  contactName: z.string().optional(),
  contactTitle: z.string().optional()
});

export const ATSAnalysisSchema = z.object({
  matchScore: z.number().min(0).max(10),
  matchingKeywords: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  recommendedFocus: z.array(z.string()),
  tailoredSummary: z.string().min(1),
  tailoredSkills: z.array(SkillCategorySchema),
  tailoredExperiences: z.array(
    z.object({
      company: z.string(),
      role: z.string(),
      period: z.string(),
      location: z.string(),
      bullets: z.array(z.string())
    })
  ),
  coldEmailSubject: z.string().min(1),
  coldEmailBody: z.string().min(1),
  coverLetter: z.string().min(1)
});

export const LLMOutputSchema = z.object({
  matchScore: z.union([z.number(), z.string()]).transform((val) => {
    const num = Number(val);
    return isNaN(num) ? 9.2 : Math.min(10, Math.max(0, num));
  }),
  matchingKeywords: z.array(z.string()).default([]),
  missingKeywords: z.array(z.string()).default([]),
  recommendedFocus: z.array(z.string()).default([]),
  tailoredSummary: z.string().min(10),
  coldEmailSubject: z.string().min(5),
  coldEmailBody: z.string().min(20),
  coverLetter: z.string().min(50)
});

// Helper validation functions
export function isValidEmail(email: string): boolean {
  return z.string().email().safeParse(email.trim()).success;
}

export function sanitizeHeaderString(val: string): string {
  // Strip CRLF and null bytes to protect against Email Header Injection
  return val.replace(/[\r\n\0]/g, ' ').replace(/\s+/g, ' ').trim();
}
