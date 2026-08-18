import chalk from 'chalk';
import { MASTER_PROFILE } from './config/profile.js';
import { scrapeJobOrCareerPage } from './scraper/careerScraper.js';
import { lookupApolloDecisionMaker } from './enrichment/apolloClient.js';
import { generateTailoredApplication } from './ai/tailorEngine.js';
import { generateResumePdf } from './pdf/pdfGenerator.js';
import { sendOrDraftEmail } from './mailer/emailSender.js';
import { saveLead } from './tracker/db.js';
import { ProcessedJobLead, JobListing } from './types/index.js';

export async function processJobTarget(targetUrl: string): Promise<ProcessedJobLead[]> {
  console.log(chalk.cyan(`\n🔍 [1/5] Sourcing & Scraping target: ${targetUrl}`));
  const jobs = await scrapeJobOrCareerPage(targetUrl);
  console.log(chalk.green(`✓ Discovered ${jobs.length} job listing(s) from target`));

  const processedLeads: ProcessedJobLead[] = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    console.log(chalk.blue(`\n💼 Processing Job #${i + 1}: ${job.jobTitle} at ${job.companyName}`));

    // 2. Decision Maker Enrichment (Apollo / Fallback)
    console.log(chalk.cyan(`👤 [2/5] Looking up decision-makers & contact email...`));
    if (job.companyDomain) {
      const apolloContact = await lookupApolloDecisionMaker(job.companyDomain, job.companyName);
      if (apolloContact) {
        job.contactEmail = apolloContact.email;
        job.contactName = apolloContact.name;
        job.contactTitle = apolloContact.title;
        console.log(
          chalk.green(
            `✓ Apollo found: ${apolloContact.name} (${apolloContact.title}) <${apolloContact.email}>`
          )
        );
      }
    }

    if (!job.contactEmail) {
      job.contactEmail = `careers@${job.companyDomain || 'company.com'}`;
      console.log(chalk.yellow(`ℹ Using fallback career contact: ${job.contactEmail}`));
    }

    // 3. AI Tailoring & ATS Scoring Engine
    console.log(chalk.cyan(`🤖 [3/5] Tailoring resume & cover letter for ${job.jobTitle}...`));
    const analysis = await generateTailoredApplication(MASTER_PROFILE, job);
    console.log(
      chalk.green(
        `✓ ATS Match Score: ${chalk.bold(`${analysis.matchScore}/10`)} (Keywords: ${analysis.matchingKeywords.slice(0, 5).join(', ')})`
      )
    );

    // 4. Generate ATS-Compliant PDF Resume
    console.log(chalk.cyan(`📄 [4/5] Compiling tailored PDF resume with Puppeteer...`));
    const pdfPath = await generateResumePdf(MASTER_PROFILE, analysis, job.companyName);
    console.log(chalk.green(`✓ Saved PDF: ${pdfPath}`));

    // 5. Draft or Dispatch Email & Record CRM Lead
    const leadId = `${job.companyName.toLowerCase()}-${Date.now()}-${i}`;
    const lead: ProcessedJobLead = {
      id: leadId,
      job,
      analysis,
      resumePdfPath: pdfPath,
      status: 'DISCOVERED',
      createdAt: new Date().toISOString()
    };

    console.log(chalk.cyan(`✉️  [5/5] Processing email outreach...`));
    const sendResult = await sendOrDraftEmail(lead);

    if (sendResult.mode === 'SENT') {
      lead.status = 'SENT';
      lead.sentAt = new Date().toISOString();
      console.log(chalk.green(`🚀 Live Email successfully sent to ${job.contactEmail}!`));
    } else {
      lead.status = 'TAILORED';
      lead.emailDraftPath = sendResult.draftPath;
      console.log(chalk.yellow(`📝 [DRY RUN] Drafted email saved to: ${sendResult.draftPath}`));
    }

    await saveLead(lead);
    console.log(chalk.green(`💾 Lead recorded in CRM database & CSV export.`));

    processedLeads.push(lead);
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
  const job: JobListing = {
    url: 'manual-entry',
    companyName: params.companyName,
    companyDomain: params.companyName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com',
    jobTitle: params.jobTitle,
    descriptionText: params.descriptionText,
    requirements: [],
    contactEmail: params.contactEmail || `careers@${params.companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
    contactName: params.contactName || 'Hiring Team'
  };

  console.log(chalk.blue(`\n💼 Processing Job: ${job.jobTitle} at ${job.companyName}`));

  // 1. AI Tailoring & ATS Scoring Engine
  console.log(chalk.cyan(`🤖 [1/3] Tailoring resume & cover letter...`));
  const analysis = await generateTailoredApplication(MASTER_PROFILE, job);
  console.log(
    chalk.green(
      `✓ ATS Match Score: ${chalk.bold(`${analysis.matchScore}/10`)} (Keywords: ${analysis.matchingKeywords.slice(0, 5).join(', ')})`
    )
  );

  // 2. Generate ATS-Compliant PDF Resume
  console.log(chalk.cyan(`📄 [2/3] Compiling tailored PDF resume with Puppeteer...`));
  const pdfPath = await generateResumePdf(MASTER_PROFILE, analysis, job.companyName);
  console.log(chalk.green(`✓ Saved PDF: ${pdfPath}`));

  // 3. Draft Outreach & Save Lead
  const leadId = `${job.companyName.toLowerCase()}-${Date.now()}`;
  const lead: ProcessedJobLead = {
    id: leadId,
    job,
    analysis,
    resumePdfPath: pdfPath,
    status: 'DISCOVERED',
    createdAt: new Date().toISOString()
  };

  console.log(chalk.cyan(`✉️  [3/3] Processing email outreach...`));
  const sendResult = await sendOrDraftEmail(lead);
  lead.status = 'TAILORED';
  lead.emailDraftPath = sendResult.draftPath;
  console.log(chalk.yellow(`📝 [DRY RUN] Drafted email saved to: ${sendResult.draftPath}`));

  await saveLead(lead);
  console.log(chalk.green(`💾 Lead recorded in CRM database & CSV export.`));

  return lead;
}
