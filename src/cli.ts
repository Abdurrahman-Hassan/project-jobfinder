import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs/promises';
import { processJobTarget } from './pipeline.js';
import { getStoredLeads, saveLead } from './tracker/db.js';
import { sendOrDraftEmail } from './mailer/emailSender.js';

const program = new Command();

program
  .name('jobfinder')
  .description('JobFinder Pro - Automated AI Job Sourcing, Resume Tailoring & Outreach Engine')
  .version('1.0.0');

program
  .command('import-cv')
  .description('Import and parse any CV / Resume file (.pdf, .txt, .md, .json) to automatically create a custom profile')
  .argument('<filePath>', 'Path to resume/CV file (e.g. ./my_resume.pdf or ./cv.txt)')
  .action(async (filePath: string) => {
    try {
      console.log(chalk.bold.cyan(`📄 Importing and parsing CV from: ${filePath}...`));
      const { parseResumeFileToProfile } = await import('./importer/resumeParser.js');
      const profile = await parseResumeFileToProfile(filePath);
      console.log(chalk.bold.green(`\n✅ Successfully parsed profile for: ${profile.name} (${profile.title})`));
      console.log(chalk.green(`📧 Contact: ${profile.email} | ${profile.phone}`));
      console.log(chalk.green(`💼 Work Experiences Loaded: ${profile.experiences.length}`));
      console.log(chalk.green(`🛠️  Skill Categories: ${profile.skillCategories.length}`));
      console.log(chalk.bold.yellow(`\n💾 Profile saved to: src/config/profile.json and is now active for all searches!`));
    } catch (err: any) {
      console.error(chalk.red(`❌ Failed to import CV: ${err.message}`));
    }
  });

program
  .command('process')
  .description('Process a company website, career link, or specific job posting URL')
  .argument('<url>', 'Target URL or domain (e.g., stripe.com/careers or https://boards.greenhouse.io/...)')
  .action(async (url: string) => {
    try {
      console.log(chalk.bold.green('🚀 Launching JobFinder Pro Pipeline...'));
      await processJobTarget(url);
      console.log(chalk.bold.green('\n✅ Processing complete! Check output/ directory for PDFs and drafts.'));
    } catch (err: any) {
      console.error(chalk.red(`❌ Execution error: ${err.message}`));
    }
  });

program
  .command('process-jd')
  .description('Process a raw Job Description file or text directly (e.g. copied from LinkedIn/Indeed)')
  .argument('<fileOrText>', 'Path to file containing JD or text')
  .option('-c, --company <name>', 'Company Name', 'Target Company')
  .option('-t, --title <title>', 'Job Title', 'Full Stack Software Engineer')
  .option('-e, --email <email>', 'Target Contact Email')
  .action(async (fileOrText: string, options: any) => {
    try {
      let jdContent = fileOrText;
      try {
        const fileData = await fs.readFile(fileOrText, 'utf-8');
        jdContent = fileData;
      } catch {
        // Not a file path, treat as raw text
      }

      console.log(chalk.bold.green('🚀 Processing direct Job Description...'));
      const { processDirectJD } = await import('./pipeline.js');
      await processDirectJD({
        companyName: options.company,
        jobTitle: options.title,
        descriptionText: jdContent,
        contactEmail: options.email
      });
      console.log(chalk.bold.green('\n✅ Processing complete! Check output/ directory for tailored PDF & email.'));
    } catch (err: any) {
      console.error(chalk.red(`❌ Execution error: ${err.message}`));
    }
  });

program
  .command('search')
  .description('Search Google/DuckDuckGo for startups & jobs matching keywords, then auto-process them')
  .argument('<query>', 'Search keywords (e.g. "AI startups hiring remote Next.js", "site:boards.greenhouse.io Full Stack")')
  .option('-l, --limit <number>', 'Number of target sites to process', '5')
  .option('--no-auto-process', 'Only display discovered URLs without processing them')
  .action(async (query: string, options: any) => {
    try {
      const { searchStartupsAndJobs } = await import('./discovery/searchEngine.js');
      const limit = parseInt(options.limit, 10) || 5;

      console.log(chalk.bold.cyan(`🔎 Searching for startups & jobs: "${query}" (Limit: ${limit})...`));
      const results = await searchStartupsAndJobs(query, limit);

      if (results.length === 0) {
        console.log(chalk.yellow('No matching startup targets found. Try broader keywords.'));
        return;
      }

      console.log(chalk.bold.green(`\n🎯 Discovered ${results.length} Target(s):`));
      results.forEach((r, i) => {
        console.log(`${i + 1}. ${chalk.bold(r.title)} (${chalk.blue(r.url)})`);
      });

      if (options.autoProcess) {
        console.log(chalk.bold.magenta('\n🚀 Auto-processing discovered targets through JobFinder Pro pipeline...'));
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          console.log(chalk.bold.magenta(`\n========================================`));
          console.log(chalk.bold.magenta(`[${i + 1}/${results.length}] Target: ${r.url}`));
          console.log(chalk.bold.magenta(`========================================`));
          try {
            await processJobTarget(r.url);
          } catch (err: any) {
            console.error(chalk.red(`Failed processing ${r.url}: ${err.message}`));
          }
        }
        console.log(chalk.bold.green('\n🎉 Finished processing all search targets!'));
      }
    } catch (err: any) {
      console.error(chalk.red(`❌ Search error: ${err.message}`));
    }
  });

program
  .command('auto-hunt')
  .description('Run automated hunting on curated startup presets (ai-startups, nextjs-fullstack, yc-startups, backend-microservices)')
  .argument('[preset]', 'Preset category: ai-startups | nextjs-fullstack | yc-startups | backend-microservices | all', 'ai-startups')
  .option('-l, --limit <number>', 'Limit per search query', '3')
  .action(async (preset: string, options: any) => {
    try {
      const { searchStartupsAndJobs, SEARCH_PRESETS } = await import('./discovery/searchEngine.js');
      const limit = parseInt(options.limit, 10) || 3;

      let queries: string[] = [];
      if (preset === 'all') {
        Object.values(SEARCH_PRESETS).forEach((qList) => queries.push(...qList));
      } else if (SEARCH_PRESETS[preset]) {
        queries = SEARCH_PRESETS[preset];
      } else {
        console.log(chalk.red(`Invalid preset. Choose from: ${Object.keys(SEARCH_PRESETS).join(', ')}, all`));
        return;
      }

      console.log(chalk.bold.cyan(`🏹 Launching Auto-Hunt Preset [${preset}] with ${queries.length} query strategy(ies)...`));

      const allDiscoveredUrls = new Set<string>();

      for (const q of queries) {
        console.log(chalk.cyan(`\n🔍 Searching: ${q}`));
        const res = await searchStartupsAndJobs(q, limit);
        res.forEach((item) => allDiscoveredUrls.add(item.url));
      }

      const targetList = Array.from(allDiscoveredUrls);
      console.log(chalk.bold.green(`\n🎯 Total Unique Targets Discovered: ${targetList.length}`));

      for (let i = 0; i < targetList.length; i++) {
        const u = targetList[i];
        console.log(chalk.bold.magenta(`\n========================================`));
        console.log(chalk.bold.magenta(`[${i + 1}/${targetList.length}] Processing: ${u}`));
        console.log(chalk.bold.magenta(`========================================`));
        try {
          await processJobTarget(u);
        } catch (err: any) {
          console.error(chalk.red(`Failed processing ${u}: ${err.message}`));
        }
      }

      console.log(chalk.bold.green('\n🎉 Auto-hunt batch completed!'));
    } catch (err: any) {
      console.error(chalk.red(`❌ Auto-hunt error: ${err.message}`));
    }
  });

program
  .command('bulk')
  .description('Process a text file with a list of target URLs / domains (one per line)')
  .argument('<filePath>', 'Path to text file containing target URLs')
  .action(async (filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const urls = content
        .split('\n')
        .map((u) => u.trim())
        .filter((u) => u.length > 0 && !u.startsWith('#'));

      console.log(chalk.bold.green(`📋 Found ${urls.length} target(s) in bulk list.`));

      for (let i = 0; i < urls.length; i++) {
        const u = urls[i];
        console.log(chalk.bold.magenta(`\n========================================`));
        console.log(chalk.bold.magenta(`[${i + 1}/${urls.length}] Processing Target: ${u}`));
        console.log(chalk.bold.magenta(`========================================`));
        try {
          await processJobTarget(u);
        } catch (err: any) {
          console.error(chalk.red(`Failed processing ${u}: ${err.message}`));
        }
      }
      console.log(chalk.bold.green('\n🎉 Bulk batch completed!'));
    } catch (err: any) {
      console.error(chalk.red(`❌ Bulk error: ${err.message}`));
    }
  });

program
  .command('stats')
  .description('Show summary of all discovered, tailored, and sent job leads')
  .action(async () => {
    const leads = await getStoredLeads();
    console.log(chalk.bold.cyan('\n📊 JobFinder Pro CRM Statistics:'));
    console.log(`Total Leads Processed: ${chalk.bold(leads.length.toString())}`);

    const tailored = leads.filter((l) => l.status === 'TAILORED').length;
    const sent = leads.filter((l) => l.status === 'SENT').length;

    console.log(`- Tailored & Drafted: ${chalk.yellow(tailored.toString())}`);
    console.log(`- Sent Applications: ${chalk.green(sent.toString())}`);

    console.log(chalk.bold('\nRecent Leads:'));
    leads.slice(0, 10).forEach((l, idx) => {
      console.log(
        `${idx + 1}. [${l.status}] ${l.job.companyName} - ${l.job.jobTitle} (ATS Score: ${l.analysis.matchScore}/10) -> ${l.job.contactEmail}`
      );
    });
  });

program
  .command('send-approved')
  .description('Send all pending drafted leads via Gmail (disabling dry run)')
  .action(async () => {
    process.env.DRY_RUN = 'false';
    const leads = await getStoredLeads();
    const pending = leads.filter((l) => l.status === 'TAILORED');

    if (pending.length === 0) {
      console.log(chalk.yellow('No pending tailored leads found to send.'));
      return;
    }

    console.log(chalk.bold.green(`📨 Sending ${pending.length} pending applications...`));

    for (const lead of pending) {
      console.log(`Sending to ${lead.job.contactEmail} (${lead.job.companyName})...`);
      const res = await sendOrDraftEmail(lead);
      if (res.mode === 'SENT') {
        lead.status = 'SENT';
        lead.sentAt = new Date().toISOString();
        await saveLead(lead);
        console.log(chalk.green(`✓ Sent!`));
      } else {
        console.log(chalk.red(`Failed: ${res.error}`));
      }
    }
  });

program.parse(process.argv);
