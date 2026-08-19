import chalk from 'chalk';
import { randomUUID } from 'crypto';
import { JobListing, ProcessedJobLead } from './types/index.js';
import { getActiveProfile } from './config/profile.js';
import { scrapeJobOrCareerPage } from './scraper/careerScraper.js';
import { lookupApolloDecisionMaker } from './enrichment/apolloClient.js';
import { generateTailoredApplication } from './ai/tailorEngine.js';
import { generateResumePdf } from './pdf/pdfGenerator.js';
import { sendOrDraftEmail } from './mailer/emailSender.js';
import { saveLead, isDuplicateLead } from './tracker/db.js';
import { isValidEmail } from './validation/schemas.js';
import { isStaffingOrAgencyText } from './discovery/searchEngine.js';
import { autoLoadResumeFromFolder } from './importer/resumeParser.js';

export async function processJobTarget(targetUrl: string): Promise<ProcessedJobLead[]> {
  await autoLoadResumeFromFolder().catch(() => {});
  const profile = getActiveProfile();
  console.log(chalk.bold.cyan(`\n🔍 Scraping target career page: ${targetUrl}`));

  let jobs: JobListing[] = [];
  try {
    jobs = await scrapeJobOrCareerPage(targetUrl);
  } catch (err: any) {
    console.error(chalk.red(`❌ Failed to scrape ${targetUrl}: ${err.message}`));
    return [];
  }

  console.log(chalk.green(`✓ Discovered ${jobs.length} relevant position(s).`));

  const processedLeads: ProcessedJobLead[] = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];

    // 1. Direct Startup / Product Company Verification Check
    const fullJobContext = `${job.companyName} ${job.jobTitle} ${job.descriptionText} ${job.companyDomain} ${job.url}`;
    if (isStaffingOrAgencyText(fullJobContext)) {
      console.log(
        chalk.yellow(
          `\n⏩ Skipping recruitment/staffing agency [${job.companyName}]: Only direct product startups & tech companies are targeted.`
        )
      );
      continue;
    }

    // 2. Deduplication Check
    const { isDuplicate, reason } = await isDuplicateLead(
      job.companyDomain,
      job.contactEmail
    );
    if (isDuplicate) {
      console.log(chalk.yellow(`\n⏩ Skipping duplicate target [${job.companyName}]: ${reason}`));
      continue;
    }

    console.log(chalk.blue(`\n💼 Processing Job #${i + 1}: ${job.jobTitle} at ${job.companyName}`));

    // Per-job error isolation
    try {
      // 1. Decision Maker Enrichment (Apollo / Fallback)
      if (job.companyDomain) {
        console.log(chalk.gray(`  • Looking up decision makers on Apollo.io for ${job.companyDomain}...`));
        const contact = await lookupApolloDecisionMaker(job.companyDomain, job.companyName);
        if (contact) {
          job.contactName = contact.name;
          job.contactTitle = contact.title;
          if (contact.email && isValidEmail(contact.email)) {
            job.contactEmail = contact.email;
          }
          console.log(chalk.magenta(`  🎯 Found Target: ${contact.name} (${contact.title}) -> ${contact.email}`));
        }
      }

      if (!job.contactEmail) {
        job.contactEmail = `careers@${job.companyDomain || 'company.com'}`;
      }

      // 2. ATS & AI Resume/Email Tailoring
      console.log(chalk.gray(`  • Running ATS Analysis & Tailoring engine...`));
      const analysis = await generateTailoredApplication(profile, job);
      console.log(
        chalk.bold.yellow(`  📊 ATS Match Score: ${analysis.matchScore}/10`) +
          chalk.gray(` | Top Keywords: ${analysis.matchingKeywords.slice(0, 4).join(', ')}`)
      );

      // 3. Automated PDF Resume Generation
      console.log(chalk.gray(`  • Compiling tailored PDF resume via Headless Chrome...`));
      const pdfPath = await generateResumePdf(profile, analysis, job.companyName);
      console.log(chalk.green(`  📄 Generated: ${pdfPath}`));

      // 4. Create Lead Record
      const lead: ProcessedJobLead = {
        id: randomUUID(),
        job,
        analysis,
        resumePdfPath: pdfPath,
        status: 'TAILORED',
        createdAt: new Date().toISOString()
      };

      // 5. Send or Draft Email
      const sendResult = await sendOrDraftEmail(lead);
      if (sendResult.mode === 'SENT') {
        lead.status = 'SENT';
        lead.sentAt = new Date().toISOString();
        console.log(chalk.bold.green(`  🚀 Application sent to ${job.contactEmail}!`));
      } else {
        lead.status = 'TAILORED';
        lead.emailDraftPath = sendResult.draftPath;
        console.log(chalk.cyan(`  📝 Application drafted to ${sendResult.draftPath}`));
      }

      // 6. Save to CRM Database & CSV
      await saveLead(lead);
      processedLeads.push(lead);
    } catch (jobErr: any) {
      console.error(chalk.red(`  ❌ Failed processing job "${job.jobTitle}" at ${job.companyName}: ${jobErr.message}`));
      const failedLead: ProcessedJobLead = {
        id: randomUUID(),
        job,
        analysis: {
          matchScore: 0,
          matchingKeywords: [],
          missingKeywords: [],
          recommendedFocus: [],
          tailoredSummary: '',
          tailoredSkills: [],
          tailoredExperiences: [],
          coldEmailSubject: '',
          coldEmailBody: '',
          coverLetter: ''
        },
        status: 'FAILED',
        error: jobErr.message,
        createdAt: new Date().toISOString()
      };
      await saveLead(failedLead).catch(() => {});
    }
  }

  return processedLeads;
}

export async function processDirectJD(params: {
  companyName: string;
  jobTitle: string;
  descriptionText: string;
  contactEmail?: string;
  contactName?: string;
}): Promise<ProcessedJobLead> {
  const profile = getActiveProfile();

  const job: JobListing = {
    url: 'manual-input',
    companyName: params.companyName,
    jobTitle: params.jobTitle,
    descriptionText: params.descriptionText,
    requirements: [],
    contactEmail: params.contactEmail,
    contactName: params.contactName
  };

  console.log(chalk.blue(`\n💼 Processing Manual JD: ${job.jobTitle} at ${job.companyName}`));

  const analysis = await generateTailoredApplication(profile, job);
  console.log(chalk.bold.yellow(`📊 ATS Match Score: ${analysis.matchScore}/10`));

  const pdfPath = await generateResumePdf(profile, analysis, job.companyName);
  console.log(chalk.green(`📄 Generated Tailored Resume: ${pdfPath}`));

  const lead: ProcessedJobLead = {
    id: randomUUID(),
    job,
    analysis,
    resumePdfPath: pdfPath,
    status: 'TAILORED',
    createdAt: new Date().toISOString()
  };

  const sendResult = await sendOrDraftEmail(lead);
  if (sendResult.mode === 'SENT') {
    lead.status = 'SENT';
    lead.sentAt = new Date().toISOString();
  } else {
    lead.emailDraftPath = sendResult.draftPath;
  }

  await saveLead(lead);
  return lead;
}

export async function processStartupPitch(startupUrl: string): Promise<ProcessedJobLead | null> {
  await autoLoadResumeFromFolder().catch(() => {});
  const profile = getActiveProfile();

  console.log(chalk.bold.magenta(`\n🚀 Reverse Sourcing: Analyzing startup landing page -> ${startupUrl}`));

  let companyName = 'Startup Team';
  let companyDomain = '';
  try {
    const parsed = new URL(startupUrl);
    companyDomain = parsed.hostname.replace(/^www\./, '');
    const cleanDomain = companyDomain.split('.')[0];
    companyName = cleanDomain.charAt(0).toUpperCase() + cleanDomain.slice(1);
  } catch {
    console.error(chalk.red(`Invalid startup URL: ${startupUrl}`));
    return null;
  }

  // 1. Scrape product overview
  let productOverview = '';
  try {
    const jobs = await scrapeJobOrCareerPage(startupUrl);
    if (jobs.length > 0 && jobs[0].descriptionText) {
      productOverview = jobs[0].descriptionText.slice(0, 1000);
      if (jobs[0].companyName && jobs[0].companyName !== 'Career Opening') {
        companyName = jobs[0].companyName;
      }
    }
  } catch {
    // fallback
  }

  // 2. Lookup Decision Makers (Founders / Engineering Leadership)
  console.log(chalk.gray(`  • Enriching founders and engineering leadership on Apollo for ${companyDomain}...`));
  const apolloResult = await lookupApolloDecisionMaker(companyDomain, companyName);

  const contactEmail = apolloResult?.email || `founders@${companyDomain}`;
  const contactName = apolloResult?.name || `${companyName} Founders & Engineering Team`;
  const contactTitle = apolloResult?.title || 'Founding & Engineering Team';

  console.log(chalk.bold.green(`  🎯 Target: ${contactName} (${contactTitle}) -> ${contactEmail}`));

  // 3. Deduplication Check
  const { isDuplicate, reason } = await isDuplicateLead(companyDomain, contactEmail);
  if (isDuplicate) {
    console.log(chalk.yellow(`\n⏩ Skipping duplicate startup pitch [${companyName}]: ${reason}`));
    return null;
  }

  const job: JobListing = {
    url: startupUrl,
    companyName,
    companyDomain,
    jobTitle: 'Founding Engineer / Platform Architect (Speculative)',
    descriptionText: productOverview || `Building innovative platforms at ${companyName}`,
    requirements: ['Next.js', 'TypeScript', 'Platform Architecture', 'AI/MCP', 'Full Stack'],
    contactEmail,
    contactName,
    contactTitle
  };

  const analysis = await generateTailoredApplication(profile, job);
  console.log(chalk.bold.yellow(`  📊 Startup Fit Score: ${analysis.matchScore}/10`));

  const pdfPath = await generateResumePdf(profile, analysis, companyName);
  console.log(chalk.green(`  📄 Generated Pitch Resume: ${pdfPath}`));

  const lead: ProcessedJobLead = {
    id: randomUUID(),
    job,
    analysis,
    resumePdfPath: pdfPath,
    status: 'TAILORED',
    createdAt: new Date().toISOString()
  };

  const sendResult = await sendOrDraftEmail(lead);
  if (sendResult.mode === 'SENT') {
    lead.status = 'SENT';
    lead.sentAt = new Date().toISOString();
  } else {
    lead.emailDraftPath = sendResult.draftPath;
  }

  await saveLead(lead);
  console.log(chalk.bold.cyan(`  📝 Speculative startup pitch drafted to ${lead.emailDraftPath || 'output/drafts/'}`));
  return lead;
}

export async function processCompanyOpportunity(companyUrl: string): Promise<ProcessedJobLead | null> {
  const { crawlCompanyWebsiteAndExtractOpportunity } = await import('./scraper/companyDeepCrawler.js');
  const crawlResult = await crawlCompanyWebsiteAndExtractOpportunity(companyUrl);
  if (!crawlResult) return null;

  await autoLoadResumeFromFolder().catch(() => {});
  const profile = getActiveProfile();

  const { companyName, companyDomain, hasActiveRole, job } = crawlResult;

  // 1. Deduplication Check
  const { isDuplicate, reason } = await isDuplicateLead(companyDomain, job.contactEmail);
  if (isDuplicate) {
    console.log(chalk.yellow(`\n⏩ Skipping duplicate company [${companyName}]: ${reason}`));
    return null;
  }

  // 2. Tailor Application (Custom Role-Tailored vs. Speculative Master Pitch)
  const analysis = await generateTailoredApplication(profile, job);
  const scoreLabel = hasActiveRole ? 'ATS Role Match Score' : 'Speculative Fit Score';
  console.log(chalk.bold.yellow(`  📊 ${scoreLabel}: ${analysis.matchScore}/10`));

  // 3. Compile Tailored PDF Resume
  const pdfPath = await generateResumePdf(profile, analysis, companyName);
  console.log(chalk.green(`  📄 Generated Resume: ${pdfPath}`));

  // 4. Draft Cold Email & Save Lead
  const lead: ProcessedJobLead = {
    id: randomUUID(),
    job,
    analysis,
    resumePdfPath: pdfPath,
    status: 'TAILORED',
    createdAt: new Date().toISOString()
  };

  const sendResult = await sendOrDraftEmail(lead);
  if (sendResult.mode === 'SENT') {
    lead.status = 'SENT';
    lead.sentAt = new Date().toISOString();
  } else {
    lead.emailDraftPath = sendResult.draftPath;
  }

  await saveLead(lead);
  const modeText = hasActiveRole ? 'Custom role application' : 'Speculative senior pitch';
  console.log(chalk.bold.cyan(`  📝 ${modeText} drafted to ${lead.emailDraftPath || 'output/drafts/'}`));
  return lead;
}
