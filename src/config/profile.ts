import fs from 'fs';
import path from 'path';
import { CandidateProfile } from '../types/index.js';

export const DEFAULT_PROFILE: CandidateProfile = {
  name: 'Abdurrahman Hassan',
  title: 'Full-Stack Software Engineer & Platform Architect',
  location: 'Karachi, Pakistan (Open to Remote / Relocation)',
  phone: '+92 3112910773',
  email: 'abdurfreelance@gmail.com',
  secondaryEmail: 'hanzalajj@gmail.com',
  linkedin: 'https://linkedin.com/in/abdurrahman-hassan',
  github: 'https://github.com/Abdurrahman-Hassan',
  portfolio: 'https://abdurrahmanhassan.netlify.app',
  summary:
    'Results-driven Software Engineer with 4 years of professional experience architecting scalable multi-tenant SaaS platforms, enterprise web portals, and AI/MCP-driven applications. Proficient in Next.js, React, Node.js, NestJS, Storyblok Headless CMS, and cloud-native infrastructure (GCP, AWS, Docker). Proven track record delivering enterprise-grade platform revamps for premier institutions (Aga Khan University & Hospital), engineering AI-integrated visual platforms with Model Context Protocol (MCP) and drag-and-drop systems (Transcend), and leading distributed teams to cut infrastructure costs by 35% and boost deployment velocity by 5x.',
  skillCategories: [
    {
      category: 'Languages',
      skills: ['TypeScript', 'JavaScript (ES6+)', 'Python', 'SQL', 'HTML5', 'CSS3', 'C++', 'Java']
    },
    {
      category: 'Frontend & UI',
      skills: [
        'Next.js (App Router, SSR/SSG/ISR)',
        'React.js',
        'SvelteKit',
        'Vue.js',
        'Storyblok (Headless CMS)',
        'Drag-and-Drop (DnD / dnd-kit)',
        'Redux Toolkit',
        'Tailwind CSS',
        'Shadcn UI',
        'Material UI',
        'Framer Motion'
      ]
    },
    {
      category: 'Backend & APIs',
      skills: [
        'Node.js',
        'NestJS',
        'Express.js',
        'Fastify',
        'RESTful APIs',
        'GraphQL',
        'Model Context Protocol (MCP)',
        'Microservices Architecture'
      ]
    },
    {
      category: 'Databases & BaaS',
      skills: [
        'PostgreSQL',
        'Supabase',
        'MongoDB',
        'Firebase Firestore',
        'Redis',
        'MySQL',
        'Appwrite',
        'Strapi'
      ]
    },
    {
      category: 'Cloud, DevOps & Tooling',
      skills: [
        'Google Cloud Platform (GCP Cloud Run, Compute Engine)',
        'AWS (EC2, S3, Lambda, API Gateway)',
        'Docker',
        'GitHub Actions (CI/CD)',
        'Vercel',
        'Netlify',
        'Cloudflare Workers',
        'NGINX',
        'Linux CLI',
        'Playwright (E2E Testing)',
        'Jest',
        'Postman'
      ]
    },
    {
      category: 'AI & Integrations',
      skills: [
        'Model Context Protocol (MCP)',
        'OpenAI API',
        'Hugging Face Spaces',
        'Gemma LLM',
        'Scikit-learn',
        'Real-time Voice Pipelines (Pipecat, Groq, Whisper, ElevenLabs, Cartesia)',
        'OpenCV',
        'Stripe Payments',
        'Twilio',
        'WhatsApp Business API'
      ]
    }
  ],
  experiences: [
    {
      id: 'cloud-primero',
      company: 'Cloud Primero',
      location: 'Karachi, Pakistan',
      role: 'Software Engineer',
      period: 'Dec 2025 – Present',
      keywords: [
        'Next.js',
        'App Router',
        'Storyblok',
        'Headless CMS',
        'Microservices',
        'Enterprise',
        'Healthcare',
        'SSR',
        'ISR',
        'MCP',
        'AI Visual Platform',
        'TypeScript'
      ],
      bullets: [
        'Spearhead frontend architecture for comprehensive digital platform revamp of Aga Khan University (AKU), Aga Khan University Hospital (AKUH), and AKU Examination Board (AKU-EB).',
        'Engineer scalable, SEO-optimized, accessible interfaces using Next.js (App Router) integrated with Storyblok Headless CMS for visual editing and dynamic multi-site delivery.',
        'Collaborate with senior backend specialists to integrate mission-critical microservices, secure healthcare and academic data APIs, and server-side rendering (SSR/ISR) workflows.',
        'Independently architected and engineered Transcend, an AI-powered visual builder application integrating Model Context Protocol (MCP) tool execution workflows with drag-and-drop (DnD) canvas interactions.'
      ]
    },
    {
      id: 'fair-trade',
      company: 'Fair Trade Sp. z o.o.',
      location: 'Remote (Poland-based)',
      role: 'Lead Software Engineer / Platform Architect',
      period: 'Feb 2025 – Dec 2025',
      keywords: [
        'Lead',
        'Architecture',
        'Team Leadership',
        'SaaS',
        'GCP',
        'Docker',
        'CI/CD',
        'GitHub Actions',
        'Hospitality',
        'Microservices',
        'Full Stack'
      ],
      bullets: [
        'Led engineering team of 4 developers in architecting, building, and deploying BoxBuy (boxbuy.pl, partner.boxbuy.pl), a multi-panel hospitality and catering SaaS platform.',
        'Engineered Catering Panel, Admin Panel (system analytics), Partner Panel (property onboarding & meal ordering), and StayPortal (stayportal.pl/lions).',
        'Designed and launched CaterBox, an enterprise corporate catering platform inspired by ezCater with multi-party group ordering and automated referral mechanisms.',
        'Hosted and maintained 10+ staging and production applications on GCP using Docker container optimization, maintaining 99%+ uptime and cutting infrastructure costs by 35%.',
        'Automated CI/CD deployment pipelines via GitHub Actions, reducing deployment errors by 90% and accelerating release cycles by 5x.'
      ]
    },
    {
      id: 'teksyo',
      company: 'Teksyo',
      location: 'Karachi, Pakistan',
      role: 'Full-Stack Developer',
      period: 'Apr 2024 – Apr 2025',
      keywords: [
        'Microservices',
        'Python',
        'AI Data Pipelines',
        'Next.js',
        'React',
        'API Latency',
        'Document Ingestion',
        'Full-Stack'
      ],
      bullets: [
        'Architected modular microservices for Fexlife (AI CRM for insurance sales) and Elefant (Hospitality SaaS), cutting API latency by 45% and page load times from 3.2s to 1.8s.',
        'Built automated Python data pipelines with AI integrations for bulk document ingestion, structured text extraction, and automated spreadsheet processing.',
        'Developed responsive custom themes and AJAX-driven UI components with Next.js and React, improving user retention by 15%.',
        'Mentored 2 junior engineers, standardizing PR code reviews and reducing onboarding duration by 50%.'
      ]
    },
    {
      id: 'tajir-express',
      company: 'Tajir Express / TajirXpress',
      location: 'Karachi, Pakistan',
      role: 'Contract Full-Stack Engineer',
      period: 'Jul 2023 – Apr 2024',
      keywords: ['Next.js', 'Supabase', 'PostgreSQL', 'E-Commerce', 'SEO', 'Core Web Vitals', 'Payment Gateways'],
      bullets: [
        'Built and deployed Next.js + Supabase e-commerce application processing 1,000+ monthly transactions with automated verification.',
        'Optimized Server-Side Rendering (SSR) and core web vitals to achieve 90+ Lighthouse SEO scores, increasing organic search traffic by 30%.',
        'Designed relational database schemas in PostgreSQL/Supabase and integrated local payment gateways.'
      ]
    }
  ],
  keyProjects: [
    {
      name: 'Transcend',
      tagline: 'AI Visual Builder & Model Context Protocol (MCP) Workflow Engine',
      description:
        'Independently architected visual builder platform integrating Model Context Protocol (MCP) workflows, complex drag-and-drop (DnD) canvas interactions, dynamic state management, and real-time execution pipelines.',
      technologies: ['Next.js', 'TypeScript', 'MCP', 'DnD Kit', 'Node.js', 'Tailwind CSS'],
      url: 'https://github.com/Abdurrahman-Hassan'
    },
    {
      name: 'Aga Khan University & Hospital Platform Revamp',
      tagline: 'Enterprise Headless CMS & Multi-Site Modernization',
      description:
        'Spearheaded frontend architecture for premier healthcare and university institutions (AKU, AKUH, AKU-EB) utilizing Next.js App Router and Storyblok Headless CMS.',
      technologies: ['Next.js', 'Storyblok Headless CMS', 'TypeScript', 'Microservices', 'Tailwind CSS']
    },
    {
      name: 'BoxBuy & CaterBox',
      tagline: 'Multi-Panel Hospitality & Corporate Catering SaaS',
      description:
        'Architected and led the engineering of multi-panel SaaS platform including guest portals, meal logistics, partner onboarding, and corporate group ordering.',
      technologies: ['React', 'Node.js', 'GCP', 'Docker', 'GitHub Actions', 'PostgreSQL']
    },
    {
      name: 'DineSync',
      tagline: 'Multi-Tenant Restaurant Operations & Live Table Management',
      description:
        'Built digital QR menu, live order tracking, table reservations, and Supabase backend with automated Playwright end-to-end testing suites.',
      technologies: ['Next.js', 'Supabase', 'TypeScript', 'Playwright', 'PostgreSQL']
    },
    {
      name: 'AdabGuard',
      tagline: 'Roman Urdu Sentiment & Toxicity NLP Analysis',
      description:
        'Engineered custom NLP toxicity classification pipeline with Scikit-learn and integrated into full-stack Next.js web interface.',
      technologies: ['Python', 'Scikit-learn', 'NLP', 'Next.js', 'TypeScript']
    }
  ],
  education: [
    {
      degree: 'Bachelor of Science in Software Engineering',
      institution: 'Virtual University of Pakistan',
      finalYearProject: 'AdabGuard (Roman Urdu Sentiment & Toxicity Analysis)'
    }
  ],
  certifications: [
    'Google Cybersecurity Professional Certificate — Google',
    'Back End Development and APIs — freeCodeCamp',
    'Cisco CyberOps Associate — Cisco Networking Academy',
    'Google IT Support Professional Certificate — Google',
    'Google Python & Google Flutter — Google',
    'Advanced Commands in Linux — Coursera',
    'ANZ Cyber Security Management Virtual Experience — ANZ / Forage'
  ]
};

// Dynamically load custom profile.json if user imported a new CV
export function getActiveProfile(): CandidateProfile {
  try {
    const jsonPath = path.resolve(process.cwd(), 'src', 'config', 'profile.json');
    if (fs.existsSync(jsonPath)) {
      const data = fs.readFileSync(jsonPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // ignore
  }
  return DEFAULT_PROFILE;
}

export const MASTER_PROFILE = getActiveProfile();
