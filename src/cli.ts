import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import readline from 'readline';
import { parseResumeFileToProfile, autoLoadResumeFromFolder } from './importer/resumeParser.js';
import { processJobTarget, processDirectJD } from './pipeline.js';
import { searchStartupsAndJobs, SEARCH_PRESETS } from './discovery/searchEngine.js';
import { getStoredLeads, saveLead, getTodaySentCount } from './tracker/db.js';

dotenv.config();

const program = new Command();

program
  .name('jobfinder')
  .description('Autonomous AI Job Hunter & Resume Tailoring Engine')
  .version('1.0.0')
  .hook('preAction', async () => {
    await autoLoadResumeFromFolder().catch(() => {});
  });

// 1. Import CV Command (Defaults to resumes/ folder if no path given)
program
  .command('import-cv [filePath]')
  .description('Import a candidate CV (PDF, JSON, TXT, MD) or auto-load from "resumes/" folder by default')
  .action(async (filePath?: string) => {
    try {
      if (filePath) {
        console.log(chalk.bold.blue(`📄 Importing candidate profile from: ${filePath}`));
        const profile = await parseResumeFileToProfile(filePath);
        console.log(chalk.bold.green(`\n✓ Successfully loaded profile for: ${profile.name} (${profile.title})`));
        console.log(chalk.gray(`Skills: ${profile.skillCategories.map((c) => c.category).join(', ')}`));
      } else {
        console.log(chalk.bold.blue(`📄 Scanning "resumes/" folder for base candidate resume...`));
        const profile = await autoLoadResumeFromFolder();
        console.log(chalk.bold.green(`\n✓ Successfully loaded active profile for: ${profile.name} (${profile.title})`));
        console.log(chalk.gray(`Skills: ${profile.skillCategories.map((c) => c.category).join(', ')}`));
      }
    } catch (err: any) {
      console.error(chalk.red(`Error importing CV: ${err.message}`));
    }
  });

// 2. Process Job URL Command
program
  .command('process <url>')
  .description('Scrape a target career page, enrich decision makers, tailor resume, and generate PDF')
  .action(async (url: string) => {
    try {
      await processJobTarget(url);
    } catch (err: any) {
      console.error(chalk.red(`Pipeline error: ${err.message}`));
    }
  });

// 2b. Pitch Directly to a Startup Website (Speculative Intro & Reverse Pitch)
program
  .command('pitch <startupUrl>')
  .description('Reverse-pitch directly to a startup homepage (scrapes product, matches resume strengths, drafts founder pitch)')
  .action(async (startupUrl: string) => {
    try {
      const { processStartupPitch } = await import('./pipeline.js');
      await processStartupPitch(startupUrl);
    } catch (err: any) {
      console.error(chalk.red(`Startup pitch error: ${err.message}`));
    }
  });

// 2c. Deep-Crawl a Specific Company Website
program
  .command('crawl <companyUrl>')
  .description('Deep-crawl a company website: inspect career & contact pages, match roles or draft speculative pitch')
  .action(async (companyUrl: string) => {
    try {
      const { processCompanyOpportunity } = await import('./pipeline.js');
      await processCompanyOpportunity(companyUrl);
    } catch (err: any) {
      console.error(chalk.red(`Crawl error: ${err.message}`));
    }
  });

function resolveLimit(cliOption?: string, fallback: number = 5): number {
  if (cliOption && !isNaN(parseInt(cliOption, 10))) {
    return Math.min(50, Math.max(1, parseInt(cliOption, 10)));
  }
  const envLimit = parseInt(process.env.DEFAULT_SEARCH_LIMIT || '', 10);
  if (!isNaN(envLimit) && envLimit > 0) {
    return Math.min(50, envLimit);
  }
  return fallback;
}

function resolveRegion(cliOption?: string, fallback: string = 'Worldwide'): string {
  if (cliOption && cliOption.trim().length > 0) {
    return cliOption.trim();
  }
  const envRegion = process.env.DEFAULT_SEARCH_REGION;
  if (envRegion && envRegion.trim().length > 0) {
    return envRegion.trim();
  }
  return fallback;
}

// 2d. Autonomous Company & Software House Discovery & Deep-Crawl
program
  .command('company-hunt <query>')
  .description('Discover software houses / startups matching a query, deep-crawl their pages, and apply (custom or speculative)')
  .option('-l, --limit <number>', 'Number of companies to find (or set DEFAULT_SEARCH_LIMIT in .env)')
  .option('-r, --region <region>', 'Target region (e.g. Remote, US, Europe, Worldwide)')
  .action(async (query: string, options) => {
    try {
      const { searchCompanyWebsites } = await import('./discovery/searchEngine.js');
      const { processCompanyOpportunity } = await import('./pipeline.js');

      const limit = resolveLimit(options.limit, 5);
      const region = resolveRegion(options.region, 'Worldwide');

      console.log(chalk.bold.magenta(`\n🏢 Searching software houses & company websites for: "${query}" [Region: ${region}] [Limit: ${limit}]...`));
      const targets = await searchCompanyWebsites(query, limit, region);

      if (targets.length === 0) {
        console.log(chalk.yellow('No matching company websites found.'));
        return;
      }

      console.log(chalk.green(`\nFound ${targets.length} target company website(s):`));
      targets.forEach((t, i) => console.log(`  ${i + 1}. ${chalk.bold(t.title)} (${chalk.blue(t.url)})`));

      console.log(chalk.bold.green(`\n🚀 Deep-crawling companies and tailoring applications...`));
      let processed = 0;
      for (const t of targets) {
        try {
          const lead = await processCompanyOpportunity(t.url);
          if (lead) processed++;
        } catch (err: any) {
          console.error(chalk.red(`Failed processing ${t.url}: ${err.message}`));
        }
      }

      console.log(chalk.bold.cyan(`\n✨ Company hunt complete: ${processed} applications drafted to output/resumes/ and output/drafts/`));
    } catch (err: any) {
      console.error(chalk.red(`Company hunt error: ${err.message}`));
    }
  });

// 2e. Google Stealth Company Discovery & Deep-Crawl
program
  .command('google-hunt <query>')
  .description('Search Google for software companies/startups, deep-crawl pages, and apply')
  .option('-l, --limit <number>', 'Number of companies to find')
  .option('-r, --region <region>', 'Target region (e.g. Remote, US, Europe, Worldwide)')
  .action(async (query: string, options) => {
    try {
      const { searchGoogleLive } = await import('./discovery/searchEngine.js');
      const { processCompanyOpportunity } = await import('./pipeline.js');

      const limit = resolveLimit(options.limit, 10);
      const region = resolveRegion(options.region, 'Worldwide');

      console.log(chalk.bold.magenta(`\n🌐 Searching Google Live for: "${query}" [Region: ${region}] [Limit: ${limit}]...`));
      const targets = await searchGoogleLive(query, limit, region);

      if (targets.length === 0) {
        console.log(chalk.yellow('No matching Google results found.'));
        return;
      }

      console.log(chalk.green(`\nFound ${targets.length} Google target(s):`));
      targets.forEach((t, i) => console.log(`  ${i + 1}. ${chalk.bold(t.title)} (${chalk.blue(t.url)})`));

      console.log(chalk.bold.green(`\n🚀 Deep-crawling companies and tailoring applications...`));
      let processed = 0;
      for (const t of targets) {
        try {
          const lead = await processCompanyOpportunity(t.url);
          if (lead) processed++;
        } catch (err: any) {
          console.error(chalk.red(`Failed processing ${t.url}: ${err.message}`));
        }
      }

      console.log(chalk.bold.cyan(`\n✨ Google hunt complete: ${processed} applications drafted to output/resumes/ and output/drafts/`));
    } catch (err: any) {
      console.error(chalk.red(`Google hunt error: ${err.message}`));
    }
  });

// 3. Process Direct JD Command
program
  .command('process-jd <fileOrText>')
  .description('Process raw Job Description text or a JD text file')
  .option('-c, --company <company>', 'Company name', 'Target Company')
  .option('-t, --title <title>', 'Job title', 'Software Engineer')
  .option('-e, --email <email>', 'Recipient contact email')
  .action(async (fileOrText: string, options) => {
    try {
      let jdContent = fileOrText;
      try {
        const fileData = await fs.readFile(fileOrText, 'utf-8');
        jdContent = fileData;
      } catch {
        // fileOrText is the raw text
      }

      await processDirectJD({
        companyName: options.company,
        jobTitle: options.title,
        descriptionText: jdContent,
        contactEmail: options.email
      });
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
    }
  });

// 4. Search Startups and Career Pages
program
  .command('search <query>')
  .description('Search startups, career pages, and ATS boards matching query')
  .option('-l, --limit <number>', 'Number of targets to find (or set DEFAULT_SEARCH_LIMIT in .env)')
  .option('-r, --region <region>', 'Target region or location (e.g. Worldwide, US, Europe, Pakistan, Remote)', 'Worldwide')
  .option('-e, --engine <engine>', 'Search engine to use (bing, ddg, google, all)', 'bing')
  .option('-b, --browser <browser>', 'Browser to use (chrome, edge, brave, camoufox, chromium)')
  .option('--no-auto-process', 'Only search and list results without processing applications')
  .action(async (query: string, options) => {
    try {
      if (options.browser) {
        process.env.BROWSER_TYPE = options.browser;
      }
      const limit = resolveLimit(options.limit, 5);
      const region = options.region || 'Worldwide';
      const engine = options.engine || 'bing';
      console.log(chalk.bold.cyan(`\n🔍 Searching startups and job boards for: "${query}" [Engine: ${engine.toUpperCase()}] [Region: ${region}] (Limit: ${limit})...`));
      const targets = await searchStartupsAndJobs(query, limit, region, engine);

      if (targets.length === 0) {
        console.log(chalk.yellow('No matching targets found.'));
        return;
      }

      console.log(chalk.green(`\nFound ${targets.length} target(s):`));
      targets.forEach((t, idx) => {
        console.log(`  ${idx + 1}. ${chalk.bold(t.title)} (${chalk.blue(t.domain)})`);
        console.log(`     URL: ${t.url}`);
        if (t.location) console.log(`     Location: ${chalk.cyan(t.location)}`);
        if (t.contactEmail) console.log(`     Contact: ${chalk.magenta(t.contactEmail)}`);
      });

      if (options.autoProcess) {
        console.log(chalk.bold.green(`\n🚀 Auto-processing discovered targets (Goal: ${limit} direct company leads)...`));
        let successfulCount = 0;

        for (const target of targets) {
          if (successfulCount >= limit) break;
          try {
            const leads = await processJobTarget(target.url);
            if (leads && leads.length > 0) {
              successfulCount += leads.length;
            }
          } catch (err: any) {
            console.error(chalk.red(`Failed processing ${target.url}: ${err.message}`));
          }
        }

        console.log(chalk.bold.cyan(`\n✨ Sourcing complete: ${successfulCount} application(s) tailored to output/resumes/ and output/drafts/`));
      }
    } catch (err: any) {
      console.error(chalk.red(`Search error: ${err.message}`));
    }
  });

// 5. Curated Auto Hunt
program
  .command('auto-hunt [preset]')
  .description('Run curated autonomous hunt. Presets: fullstack-ai, nextjs-architect, mcp-agentic, pakistan-tech')
  .option('-l, --limit <number>', 'Targets per query (or set DEFAULT_SEARCH_LIMIT in .env)')
  .option('-r, --region <region>', 'Target region (e.g. Worldwide, US, Europe, Remote, Pakistan)', 'Worldwide')
  .option('-e, --engine <engine>', 'Search engine to use (bing, ddg, google, all)', 'bing')
  .option('-b, --browser <browser>', 'Browser to use (chrome, edge, brave, camoufox, chromium)')
  .action(async (preset: string = 'fullstack-ai', options) => {
    if (options.browser) {
      process.env.BROWSER_TYPE = options.browser;
    }
    const queries = SEARCH_PRESETS[preset] || SEARCH_PRESETS['fullstack-ai'];
    const limit = resolveLimit(options.limit, 3);
    const region = options.region || 'Worldwide';
    const engine = options.engine || 'bing';

    console.log(chalk.bold.magenta(`\n🎯 Starting Autonomous Job Hunt [Preset: ${preset}] [Engine: ${engine.toUpperCase()}] [Region: ${region}]`));

    for (const query of queries) {
      console.log(chalk.cyan(`\n── Executing Dork Query: "${query}" ──`));
      const targets = await searchStartupsAndJobs(query, limit, region, engine);

      for (const target of targets) {
        try {
          await processJobTarget(target.url);
        } catch (err: any) {
          console.error(chalk.red(`Failed to process ${target.url}: ${err.message}`));
        }
      }
    }
    console.log(chalk.bold.green('\n🎉 Hunt complete! Check "npm run stats" or output/resumes/ and output/drafts/'));
  });

// 6. Detected Browsers
program
  .command('browsers')
  .description('List all detected web browsers available on this machine')
  .action(async () => {
    const { listAvailableBrowsers, getBrowserExecutable } = await import('./utils/browserManager.js');
    const browsers = await listAvailableBrowsers();
    const active = await getBrowserExecutable();

    console.log(chalk.bold.cyan('\n🌐 Installed Browser Matrix:'));
    if (browsers.length === 0) {
      console.log(chalk.yellow('No system browsers found. Puppeteer bundled Chromium will be used.'));
      return;
    }

    browsers.forEach((b, idx) => {
      const isSelected = b.path === active;
      const marker = isSelected ? chalk.bold.green('✓ [ACTIVE]') : chalk.gray(' ');
      console.log(`  ${idx + 1}. ${marker} ${chalk.bold(b.name)} (${chalk.blue(b.type)})`);
      console.log(`     Path: ${chalk.gray(b.path)}`);
    });

    console.log(chalk.gray('\nTip: To change browser, run with "-b edge" or set BROWSER_TYPE=edge in .env'));
  });

// 6. Bulk Process URLs from a File
program
  .command('bulk <filePath>')
  .description('Process a list of job/career URLs from a text file (one URL per line)')
  .action(async (filePath: string) => {
    try {
      const resolvedPath = path.resolve(process.cwd(), filePath);
      const content = await fs.readFile(resolvedPath, 'utf-8');
      const urls = content
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));

      console.log(chalk.bold.cyan(`\n📋 Processing ${urls.length} URLs in bulk from ${filePath}...`));

      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        console.log(chalk.bold.blue(`\n[${i + 1}/${urls.length}] Target: ${url}`));
        try {
          await processJobTarget(url);
        } catch (err: any) {
          console.error(chalk.red(`Failed on ${url}: ${err.message}`));
        }
      }
    } catch (err: any) {
      console.error(chalk.red(`Bulk error: ${err.message}`));
    }
  });

// 7. CRM Dashboard Stats
program
  .command('stats')
  .description('Show CRM statistics of all processed, tailored, and sent leads')
  .action(async () => {
    const leads = await getStoredLeads();
    const tailored = leads.filter((l) => l.status === 'TAILORED').length;
    const sent = leads.filter((l) => l.status === 'SENT').length;
    const failed = leads.filter((l) => l.status === 'FAILED').length;
    const todaySent = await getTodaySentCount();
    const dailyLimit = parseInt(process.env.DAILY_EMAIL_LIMIT || '20', 10);

    console.log(chalk.bold.cyan('\n📊 JobFinder Pro CRM Statistics:'));
    console.log(`Total Leads Processed: ${chalk.bold(leads.length)}`);
    console.log(`- Tailored & Drafted: ${chalk.yellow(tailored)}`);
    console.log(`- Sent Applications: ${chalk.green(sent)}`);
    if (failed > 0) console.log(`- Failed / Incomplete: ${chalk.red(failed)}`);
    console.log(`- Sent Today: ${chalk.bold.magenta(todaySent)} / ${chalk.gray(dailyLimit)} (Daily Cap)`);

    if (leads.length > 0) {
      console.log(chalk.bold('\nRecent Leads:'));
      leads.slice(0, 10).forEach((l, idx) => {
        const statusColor =
          l.status === 'SENT' ? chalk.green : l.status === 'FAILED' ? chalk.red : chalk.yellow;
        console.log(
          `${idx + 1}. [${statusColor(l.status)}] ${l.job?.companyName || 'Unknown'} - ${l.job?.jobTitle || 'Role'} (ATS Score: ${l.analysis?.matchScore || 0}/10) -> ${l.job?.contactEmail || 'No email'}`
        );
      });
    }
    console.log('');
  });

// 8. Send Approved Drafts via Gmail
program
  .command('send-approved')
  .description('Send pending drafted leads via Gmail with daily limit and SMTP safety')
  .option('-y, --yes', 'Skip confirmation prompt and send immediately')
  .action(async (options) => {
    process.env.DRY_RUN = 'false';
    const leads = await getStoredLeads();
    const pending = leads.filter((l) => l.status === 'TAILORED');

    if (pending.length === 0) {
      console.log(chalk.yellow('No pending tailored leads found to send.'));
      return;
    }

    // Daily Send Limit Check
    const dailyLimit = parseInt(process.env.DAILY_EMAIL_LIMIT || '20', 10);
    const todaySent = await getTodaySentCount();
    const remainingQuota = Math.max(0, dailyLimit - todaySent);

    if (remainingQuota <= 0) {
      console.log(
        chalk.bold.red(
          `🛑 Daily email limit reached (${todaySent}/${dailyLimit} sent today). To protect domain reputation, sending is halted until tomorrow.`
        )
      );
      return;
    }

    const toSendCount = Math.min(pending.length, remainingQuota);

    // Confirmation Prompt (if not bypassed with -y)
    if (!options.yes) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(
          chalk.bold.yellow(
            `\n⚠️ You are about to send ${toSendCount} live email(s) via Gmail (Daily quota remaining: ${remainingQuota}). Proceed? [y/N]: `
          ),
          resolve
        );
      });
      rl.close();

      if (answer.trim().toLowerCase() !== 'y') {
        console.log(chalk.gray('Sending cancelled.'));
        return;
      }
    }

    const { verifySmtpConnection, sendOrDraftEmail } = await import('./mailer/emailSender.js');
    const isSmtpValid = await verifySmtpConnection();
    if (!isSmtpValid) {
      console.log(chalk.bold.red('❌ SMTP Authentication failed. Halting send queue. Check GMAIL_APP_PASSWORD.'));
      return;
    }

    console.log(chalk.bold.green(`\n📨 Sending ${toSendCount} pending application(s) via Gmail...`));

    for (let i = 0; i < toSendCount; i++) {
      const lead = pending[i];
      console.log(`\n[${i + 1}/${toSendCount}] Sending to ${lead.job.contactEmail} (${lead.job.companyName})...`);
      const res = await sendOrDraftEmail(lead);

      if (res.mode === 'SENT') {
        lead.status = 'SENT';
        lead.sentAt = new Date().toISOString();
        await saveLead(lead);
        console.log(chalk.green(`✓ Successfully sent to ${lead.job.contactEmail}!`));

        // Randomized human delay between consecutive sends (45s - 90s)
        if (i < toSendCount - 1) {
          const minDelay = parseInt(process.env.MIN_DELAY_SECONDS || '45', 10);
          const maxDelay = parseInt(process.env.MAX_DELAY_SECONDS || '90', 10);
          const delaySec = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          console.log(chalk.cyan(`⏳ Waiting ${delaySec}s before next send to protect domain reputation...`));
          await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
        }
      } else {
        console.log(chalk.red(`Failed sending to ${lead.job.contactEmail}: ${res.error}`));
      }
    }
    console.log(chalk.bold.green('\n🎉 Send queue completed! Check "npm run stats".'));
  });

// 9. Send Test Email to Self (Visual Verification)
program
  .command('test-email [targetEmail]')
  .description('Send a test application email with tailored PDF resume attached to your own inbox')
  .action(async (targetEmail?: string) => {
    process.env.DRY_RUN = 'false';
    const { getActiveProfile } = await import('./config/profile.js');
    const { sendOrDraftEmail, verifySmtpConnection } = await import('./mailer/emailSender.js');
    const { getStoredLeads } = await import('./tracker/db.js');

    const profile = getActiveProfile();
    const recipient = targetEmail || process.env.GMAIL_USER || profile.email;

    console.log(chalk.bold.cyan(`\n🧪 Preparing Live Test Email to: ${chalk.bold(recipient)}...`));

    const isSmtpValid = await verifySmtpConnection();
    if (!isSmtpValid) {
      console.log(chalk.bold.red('❌ SMTP Authentication failed. Check GMAIL_APP_PASSWORD in .env.'));
      return;
    }

    const leads = await getStoredLeads();
    const sampleLead = leads[0] || {
      id: 'test-lead',
      job: {
        url: 'https://example.com/careers',
        companyName: 'Acme AI Labs',
        companyDomain: 'example.com',
        jobTitle: 'Full-Stack Software Engineer (Test)',
        descriptionText: 'Next.js, TypeScript, Node.js, Cloud Architecture',
        requirements: ['Next.js', 'TypeScript', 'Node.js'],
        contactEmail: recipient
      },
      analysis: {
        matchScore: 9.8,
        matchingKeywords: ['TypeScript', 'Next.js', 'Node.js', 'PostgreSQL'],
        missingKeywords: [],
        recommendedFocus: ['Next.js'],
        tailoredSummary: profile.summary,
        tailoredSkills: profile.skillCategories,
        tailoredExperiences: profile.experiences,
        coldEmailSubject: `Test Application: Full-Stack Software Engineer — ${profile.name}`,
        coldEmailBody: `Hi Team,\n\nThis is a live test email from JobFinder Pro demonstrating a tailored application with PDF resume attached.\n\nBest regards,\n${profile.name}\nPhone: ${profile.phone}`,
        coverLetter: `Test cover letter for ${profile.name}.`
      },
      resumePdfPath: path.resolve(process.cwd(), 'output', 'resumes', 'ABDURRAHMAN_HASSAN_Wortel.pdf'),
      status: 'TAILORED',
      createdAt: new Date().toISOString()
    };

    // Clone and route to test recipient
    const testLead = JSON.parse(JSON.stringify(sampleLead));
    testLead.job.contactEmail = recipient;
    testLead.analysis.coldEmailSubject = `[TEST APPLICATION] Full-Stack Software Engineer — ${profile.name}`;

    console.log(chalk.gray(`  • Attaching PDF resume: ${testLead.resumePdfPath}`));
    console.log(chalk.gray(`  • Dispatching via Gmail SMTP (${process.env.GMAIL_USER})...`));

    const res = await sendOrDraftEmail(testLead);
    if (res.mode === 'SENT') {
      console.log(chalk.bold.green(`\n🎉 Test email successfully sent to ${recipient}!`));
      console.log(chalk.cyan(`👉 Open your Gmail inbox (${recipient}) to inspect the email, subject line, and PDF attachment!`));
    } else {
      console.log(chalk.bold.red(`\n❌ Failed sending test email: ${res.error}`));
    }
  });

program.parse(process.argv);
