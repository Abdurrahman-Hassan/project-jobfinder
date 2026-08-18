import axios from 'axios';

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
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return null;
  }

  const targetTitles = [
    'Engineering Manager',
    'VP of Engineering',
    'Vice President of Engineering',
    'Head of Engineering',
    'Director of Engineering',
    'Technical Recruiter',
    'Senior Technical Recruiter',
    'Talent Acquisition Lead',
    'Chief Technology Officer',
    'CTO',
    'Founder',
    'Co-Founder'
  ];

  try {
    const response = await axios.post(
      'https://api.apollo.io/v1/mixed_people/search',
      {
        api_key: apiKey,
        q_organization_domains: companyDomain,
        person_titles: targetTitles,
        page: 1,
        per_page: 5
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        timeout: 10000
      }
    );

    const people = response.data?.people || [];
    if (people.length === 0) {
      return null;
    }

    // Pick best match with an email
    for (const person of people) {
      if (person.email && !person.email_locked) {
        return {
          name: person.name || `${person.first_name} ${person.last_name}`,
          firstName: person.first_name || 'Hiring Team',
          lastName: person.last_name || '',
          title: person.title || 'Engineering Leader',
          email: person.email,
          linkedinUrl: person.linkedin_url
        };
      }
    }

    // If email is not directly exposed, grab first top lead with estimated/extrapolated format
    const topPerson = people[0];
    if (topPerson && topPerson.name) {
      return {
        name: topPerson.name,
        firstName: topPerson.first_name || 'Hiring Team',
        lastName: topPerson.last_name || '',
        title: topPerson.title || 'Engineering Leader',
        email: topPerson.email || `careers@${companyDomain}`,
        linkedinUrl: topPerson.linkedin_url
      };
    }

    return null;
  } catch (error: any) {
    console.warn(`[Apollo] Lookup failed for ${companyDomain}:`, error?.response?.data?.message || error.message);
    return null;
  }
}
