import chalk from 'chalk';

export function printHelpGuide() {
  console.log(chalk.bold.cyan(`\n══════════════════════════════════════════════════════════════════════`));
  console.log(chalk.bold.magenta(`                🚀 JobFinder Pro — User Guide & Playbook             `));
  console.log(chalk.bold.cyan(`══════════════════════════════════════════════════════════════════════\n`));

  console.log(chalk.bold.yellow(`📋 1. GETTING STARTED (Fast Track)\n`));
  console.log(`  ${chalk.bold('Step 1: Ingest Your Resume')}`);
  console.log(`    Put your PDF resume into the ${chalk.green('resumes/')} folder and run:`);
  console.log(chalk.green(`    npm run import-cv`));
  console.log(`    ${chalk.gray('↳ Parses your experience, skills, and contact info into src/config/profile.json')}\n`);

  console.log(`  ${chalk.bold('Step 2: Configure Environment (.env)')}`);
  console.log(`    Set your Gmail App Password and optional API keys (OpenRouter, Apollo.io) in ${chalk.cyan('.env')}\n`);

  console.log(`  ${chalk.bold('Step 3: Test with a Dry Run')}`);
  console.log(chalk.green(`    npm run auto-apply:dry -- -l 3 -r "Remote" "Next.js Full Stack"`));
  console.log(`    ${chalk.gray('↳ Fills forms, answers screening questions with AI, and saves proof screenshots to output/screenshots/')}\n`);

  console.log(chalk.bold.yellow(`🎯 2. HIGH-IMPACT COMMAND CHEATSHEET\n`));
  console.log(`  ${chalk.bold.cyan('• 100% Autonomous Auto-Apply (Live Submission)')}`);
  console.log(chalk.green(`    npm run auto-apply -- -l 10 -r "Remote" "Next.js engineer"`));
  console.log(`    ${chalk.gray('↳ Discovers ATS jobs, tailors custom PDF resumes, answers AI questions, and submits live!')}\n`);

  console.log(`  ${chalk.bold.cyan('• Target Specific ATS URL (Workable, Lever, Greenhouse, Ashby)')}`);
  console.log(chalk.green(`    npm run apply:submit -- "https://apply.workable.com/company/j/job-id/"`));
  console.log(`    ${chalk.gray('↳ Auto-fills all 15+ fields, attaches tailored PDF, and submits.')}\n`);

  console.log(`  ${chalk.bold.cyan('• ATS Job Sourcing & Tailoring (Without Submitting)')}`);
  console.log(chalk.green(`    npm run ats-hunt -- -l 15 -r "Remote" "Frontend React Developer"`));
  console.log(`    ${chalk.gray('↳ Generates tailored PDF resumes in output/resumes/ and drafts in output/drafts/')}\n`);

  console.log(`  ${chalk.bold.cyan('• Pitch Direct Companies & Software Houses')}`);
  console.log(chalk.green(`    npm run company-hunt -- -l 10 "SaaS software agencies remote"`));
  console.log(`    ${chalk.gray('↳ Discovers hiring manager inboxes via Apollo and drafts personalized emails.')}\n`);

  console.log(`  ${chalk.bold.cyan('• Send Approved Cold Emails (DNS MX-Verified)')}`);
  console.log(chalk.green(`    npm run send`));
  console.log(`    ${chalk.gray('↳ Checks DNS MX records to prevent 550 bounces and sends via Gmail SMTP.')}\n`);

  console.log(`  ${chalk.bold.cyan('• CRM Analytics & Job Tracker')}`);
  console.log(chalk.green(`    npm run stats`));
  console.log(`    ${chalk.gray('↳ Shows match scores, application counts, and exports output/job_leads.csv.')}\n`);

  console.log(chalk.bold.yellow(`💡 3. PRO-TIPS & STRATEGY ADVICE\n`));
  console.log(`  ${chalk.bold('Tip 1: Keyword Specificity')}`);
  console.log(`    Instead of generic terms like "developer", search for your core stack:`);
  console.log(chalk.gray(`    e.g. "Next.js TypeScript", "React Node.js GCP", "NestJS Microservices"`));
  console.log(`    This yields higher ATS match scores (> 9.5/10) and faster callbacks.\n`);

  console.log(`  ${chalk.bold('Tip 2: Search Engine Cascading')}`);
  console.log(`    JobFinder Pro searches ${chalk.cyan('Bing')} first for fast, CAPTCHA-free direct ATS discovery,`);
  console.log(`    supplements with ${chalk.cyan('DuckDuckGo')}, and uses ${chalk.cyan('Google')} only as a last resort.\n`);

  console.log(`  ${chalk.bold('Tip 3: Cold Email Deliverability')}`);
  console.log(`    Always verify your SMTP setup first with ${chalk.green('npm run test-email')}.`);
  console.log(`    The built-in DNS MX guard automatically blocks dead domains so your sender score stays 100% clean.\n`);

  console.log(chalk.bold.cyan(`══════════════════════════════════════════════════════════════════════\n`));
}
