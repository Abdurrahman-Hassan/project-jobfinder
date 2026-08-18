export interface CandidateProfile {
  name: string;
  title: string;
  location: string;
  phone: string;
  email: string;
  secondaryEmail?: string;
  linkedin: string;
  github: string;
  portfolio: string;
  summary: string;
  skillCategories: {
    category: string;
    skills: string[];
  }[];
  experiences: ExperienceItem[];
  keyProjects: ProjectItem[];
  education: {
    degree: string;
    institution: string;
    location?: string;
    finalYearProject?: string;
  }[];
  certifications: string[];
}

export interface ExperienceItem {
  id: string;
  company: string;
  location: string;
  role: string;
  period: string;
  bullets: string[];
  keywords: string[];
}

export interface ProjectItem {
  name: string;
  tagline: string;
  description: string;
  technologies: string[];
  url?: string;
}

export interface JobListing {
  url: string;
  companyName: string;
  companyDomain?: string;
  jobTitle: string;
  location?: string;
  department?: string;
  descriptionText: string;
  requirements: string[];
  contactEmail?: string;
  contactName?: string;
  contactTitle?: string;
}

export interface ATSAnalysis {
  matchScore: number; // 0 to 10
  matchingKeywords: string[];
  missingKeywords: string[];
  recommendedFocus: string[];
  tailoredSummary: string;
  tailoredSkills: { category: string; skills: string[] }[];
  tailoredExperiences: {
    company: string;
    role: string;
    period: string;
    location: string;
    bullets: string[];
  }[];
  coldEmailSubject: string;
  coldEmailBody: string;
  coverLetter: string;
}

export interface ProcessedJobLead {
  id: string;
  job: JobListing;
  analysis: ATSAnalysis;
  resumePdfPath?: string;
  emailDraftPath?: string;
  status: 'DISCOVERED' | 'TAILORED' | 'APPROVED' | 'SENT' | 'FAILED';
  createdAt: string;
  sentAt?: string;
  error?: string;
}
