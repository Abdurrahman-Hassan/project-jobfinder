import axios from 'axios';
import chalk from 'chalk';
import { isValidEmail } from '../validation/schemas.js';

export interface ApolloContact {
  name: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  linkedinUrl?: string;
  confidenceScore?: number;
}

export async function lookupApolloDecisionMaker(
  companyDomain: string,
  companyName: string
): Promise<ApolloContact | null> {
  const apiKey = process.env.APOLLO_API_KEY?.trim();

  const cleanDomain = (companyDomain || '')
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();

  if (!cleanDomain) return null;

  // 1. Try Apollo.io API with X-Api-Key header (works on paid Apollo plans)
  if (apiKey) {
    try {
      const titles = [
        'Chief Technology Officer',
        'CTO',
        'VP of Engineering',
        'Vice President of Engineering',
        'Head of Engineering',
        'Engineering Manager',
        'Founder',
        'Co-Founder',
        'Lead Software Engineer',
        'Technical Recruiter',
        'Talent Acquisition'
      ];

      const response = await axios.post(
        'https://api.apollo.io/v1/mixed_people/search',
        {
          q_organization_domains: cleanDomain,
          person_titles: titles,
          page: 1,
          per_page: 5
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key': apiKey
          },
          timeout: 8000
        }
      );

      const people = response.data?.people || [];
      if (people.length > 0) {
        const bestContact =
          people.find((p: any) => p.email && isValidEmail(p.email)) ||
          people.find((p: any) => p.first_name && p.last_name) ||
          people[0];

        const firstName = bestContact.first_name || 'Hiring';
        const lastName = bestContact.last_name || 'Team';
        const fullName = bestContact.name || `${firstName} ${lastName}`.trim();
        const title = bestContact.title || 'Engineering Leader';
        const email =
          bestContact.email && isValidEmail(bestContact.email)
            ? bestContact.email
            : `careers@${cleanDomain}`;

        return {
          name: fullName,
          firstName,
          lastName,
          title,
          email,
          linkedinUrl: bestContact.linkedin_url || undefined,
          confidenceScore: bestContact.email ? 95 : 60
        };
      }
    } catch (error: any) {
      const isFreeTierRestriction =
        error.response?.data?.error_code === 'API_INACCESSIBLE' ||
        error.response?.status === 403;

      if (isFreeTierRestriction) {
        console.log(
          chalk.gray(
            `  • [Apollo Note] Free plan detected. Routing to direct company hiring inbox (careers@${cleanDomain}).`
          )
        );
      } else {
        console.warn(
          chalk.yellow(
            `[Apollo Warning] Could not enrich contacts for domain "${cleanDomain}": ${error.message}`
          )
        );
      }
    }
  }

  // 2. Intelligent Default: Route to Company Engineering & Careers Leadership Inbox
  return {
    name: `${companyName} Engineering Leadership`,
    firstName: 'Engineering',
    lastName: 'Team',
    title: 'Hiring Team & Engineering Leadership',
    email: `careers@${cleanDomain}`,
    confidenceScore: 70
  };
}
