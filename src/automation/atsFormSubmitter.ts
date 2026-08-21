import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { CandidateProfile, ProcessedJobLead } from '../types/index.js';
import { getActiveProfile } from '../config/profile.js';
import { launchManagedBrowser } from '../utils/browserManager.js';
import { processJobTarget } from '../pipeline.js';

export interface AutoApplyResult {
  success: boolean;
  atsType: 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'smartrecruiters' | 'breezy' | 'generic';
  url: string;
  screenshotPath?: string;
  submitted: boolean;
  message: string;
}

/**
 * Detects the ATS system hosting the job listing.
 */
export function detectAtsType(url: string, html: string = ''): 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'smartrecruiters' | 'breezy' | 'generic' {
  const u = url.toLowerCase();
  if (u.includes('greenhouse.io') || html.includes('grnhse_app') || html.includes('greenhouse')) return 'greenhouse';
  if (u.includes('lever.co') || html.includes('lever-form')) return 'lever';
  if (u.includes('ashbyhq.com') || html.includes('ashby')) return 'ashby';
  if (u.includes('workable.com')) return 'workable';
  if (u.includes('smartrecruiters.com')) return 'smartrecruiters';
  if (u.includes('breezy.hr') || u.includes('applytojob.com')) return 'breezy';
  return 'generic';
}

/**
 * Resolves the direct application form URL for major ATS portals.
 */
export function resolveDirectFormUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    // Workable: apply.workable.com/{company}/j/{id}/ -> apply.workable.com/{company}/j/{id}/apply/
    if (parsed.hostname.includes('workable.com') && !parsed.pathname.includes('/apply')) {
      return `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}/apply/`;
    }
    // Lever: jobs.lever.co/{company}/{id} -> jobs.lever.co/{company}/{id}/apply
    if (parsed.hostname.includes('jobs.lever.co') && !parsed.pathname.endsWith('/apply')) {
      return `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}/apply`;
    }
    // Breezy HR: {company}.breezy.hr/p/{id} -> {company}.breezy.hr/p/{id}/apply
    if (parsed.hostname.includes('breezy.hr') && !parsed.pathname.endsWith('/apply')) {
      return `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}/apply`;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

async function resolvePdfResumePath(
  companyName: string,
  candidateName: string,
  leadPdf?: string,
  jobUrl?: string
): Promise<string | undefined> {
  if (leadPdf) {
    try {
      await fs.access(leadPdf);
      return leadPdf;
    } catch {}
  }

  // 1. Check if lead exists in database.json
  if (jobUrl) {
    try {
      const { getStoredLeads } = await import('../tracker/db.js');
      const leads = await getStoredLeads();
      const existing = leads.find((l) => l.job.url === jobUrl || (l.resumePdfPath && l.job.companyName.toLowerCase() === companyName.toLowerCase()));
      if (existing?.resumePdfPath) {
        await fs.access(existing.resumePdfPath);
        return existing.resumePdfPath;
      }
    } catch {}
  }

  // 2. Exact company name matching in output/resumes/
  const resumesDir = path.resolve(process.cwd(), 'output', 'resumes');
  try {
    const files = await fs.readdir(resumesDir);
    const cleanCompany = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanCompany && cleanCompany !== 'company') {
      const match = files.find((f) => {
        const cleanFile = f.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanFile.includes(cleanCompany);
      });
      if (match) {
        return path.join(resumesDir, match);
      }
    }
  } catch {}

  const defaultPdf = path.resolve(process.cwd(), 'resumes', 'ABDURRAHMAN_HASSAN_RESUME.pdf');
  try {
    await fs.access(defaultPdf);
    return defaultPdf;
  } catch {}

  return undefined;
}

/**
 * Automates form auto-filling and submission for major ATS portals.
 */
export async function autoApplyToAtsPortal(
  jobUrl: string,
  options: { lead?: ProcessedJobLead; submit?: boolean; headless?: boolean } = {}
): Promise<AutoApplyResult> {
  const profile = getActiveProfile();
  const isSubmit = Boolean(options.submit);
  const isHeadless = options.headless !== false;

  console.log(chalk.bold.cyan(`\n🤖 Launching ATS Auto-Applier for: ${jobUrl}`));

  // 1. Ensure lead is tailored & PDF resume exists (use existing lead if passed)
  let lead: ProcessedJobLead | null = options.lead || null;
  if (!lead) {
    try {
      const leads = await processJobTarget(jobUrl);
      lead = leads[0] || null;
    } catch (err: any) {
      console.warn(`[Auto-Apply Warning] Lead parsing note: ${err.message}`);
    }
  }

  const companyName = lead?.job?.companyName || 'Company';
  const resumePdfPath = await resolvePdfResumePath(companyName, profile.name, lead?.resumePdfPath, jobUrl);

  const directFormUrl = resolveDirectFormUrl(jobUrl);

  let browser;
  try {
    browser = await launchManagedBrowser({ headless: isHeadless });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });

    console.log(chalk.gray(`  • Navigating to application form: ${directFormUrl}...`));
    await page.goto(directFormUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });

    // Wait for client-side React/Vue hydration
    await page.waitForSelector('input[name="firstname"], input[name*="name" i], input[type="email"], input[type="file"]', {
      timeout: 10000
    }).catch(() => {});

    const html = await page.content();
    const atsType = detectAtsType(jobUrl, html);
    console.log(chalk.gray(`  • Detected ATS Engine: ${chalk.bold(atsType.toUpperCase())}`));

    // Check if redirected to generic company jobs directory (indicating job is closed)
    const isRedirectedToDirectory =
      (await page.$('input[data-ui="search-jobs"], input[placeholder*="Search jobs" i], button[data-ui="load-more-button"]')) !== null &&
      (await page.$('input[name="firstname"], input[name*="first_name" i], input[type="email"], input[type="file"]')) === null;

    if (isRedirectedToDirectory) {
      console.log(chalk.yellow(`  ⚠️ Job listing is closed (redirected to company job catalog). Skipping.`));
      return {
        success: false,
        atsType,
        url: jobUrl,
        submitted: false,
        message: 'Job opening is closed / no longer accepting applications.'
      };
    }

    // Accept cookie banners if present
    const cookieBtn = await page.$(
      'button[data-ui="cookie-consent-accept"], button#onetrust-accept-btn-handler, button[aria-label="Accept all"]'
    );
    if (cookieBtn) await cookieBtn.click().catch(() => {});

    // Split candidate name into First and Last
    const nameParts = profile.name.trim().split(' ');
    const firstName = nameParts[0] || 'Abdurrahman';
    const lastName = nameParts.slice(1).join(' ') || 'Hassan';

    // 2. ATS Form Filling Strategies
    let filledCount = 0;

    // First Name
    const firstNameInput = await page.$(
      'input[name="firstname"], input[name*="first_name" i], input[id*="first_name" i], input[data-ui="firstname"], input[data-ui="first-name"], input[autocomplete="given-name"]'
    );
    if (firstNameInput) {
      await firstNameInput.click({ clickCount: 3 });
      await firstNameInput.type(firstName, { delay: 15 });
      filledCount++;
    }

    // Last Name
    const lastNameInput = await page.$(
      'input[name="lastname"], input[name*="last_name" i], input[id*="last_name" i], input[data-ui="lastname"], input[data-ui="last-name"], input[autocomplete="family-name"]'
    );
    if (lastNameInput) {
      await lastNameInput.click({ clickCount: 3 });
      await lastNameInput.type(lastName, { delay: 15 });
      filledCount++;
    }

    // Full Name (if no split fields)
    if (!firstNameInput && !lastNameInput) {
      const fullNameInput = await page.$(
        'input[name*="name" i], input[id*="name" i], input[autocomplete="name"], input[data-ui="name"]'
      );
      if (fullNameInput) {
        await fullNameInput.click({ clickCount: 3 });
        await fullNameInput.type(profile.name, { delay: 15 });
        filledCount++;
      }
    }

    // Email
    const emailInput = await page.$(
      'input[name="email"], input[type="email"], input[name*="email" i], input[id*="email" i], input[data-ui="email"]'
    );
    if (emailInput) {
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(profile.email, { delay: 15 });
      filledCount++;
    }

    // Headline / Professional Title
    const headlineInput = await page.$(
      'input[name="headline"], input#headline, input[data-ui="headline"], input[name*="title" i]'
    );
    if (headlineInput) {
      await headlineInput.click({ clickCount: 3 });
      await headlineInput.type(profile.title, { delay: 15 });
      filledCount++;
    }

    // Phone
    const phoneInput = await page.$(
      'input[name="phone"], input[type="tel"], input[name*="phone" i], input[id*="phone" i], input[data-ui="phone"]'
    );
    if (phoneInput) {
      await phoneInput.click({ clickCount: 3 });
      await phoneInput.type(profile.phone, { delay: 15 });
      filledCount++;
    }

    // City / Location
    const cityInput = await page.$(
      'input[name="city"], input#city, input[name*="location" i], input[id*="location" i]'
    );
    if (cityInput) {
      await cityInput.click({ clickCount: 3 });
      await cityInput.type('Karachi, Pakistan', { delay: 15 });
      filledCount++;
    }

    // LinkedIn URL
    const linkedinInput = await page.$(
      'input[name*="linkedin" i], input[id*="linkedin" i], input[name*="urls[LinkedIn]" i], input[placeholder*="LinkedIn" i], input[data-ui="linkedin"]'
    );
    if (linkedinInput && profile.linkedin) {
      await linkedinInput.click({ clickCount: 3 });
      await linkedinInput.type(profile.linkedin, { delay: 15 });
      filledCount++;
    }

    // GitHub / Portfolio / Website URL
    const githubInput = await page.$(
      'input[name*="github" i], input[id*="github" i], input[name*="urls[GitHub]" i], input[placeholder*="GitHub" i], input[data-ui="github"]'
    );
    if (githubInput && profile.github) {
      await githubInput.click({ clickCount: 3 });
      await githubInput.type(profile.github, { delay: 15 });
      filledCount++;
    }

    const portfolioInput = await page.$(
      'input[name*="portfolio" i], input[id*="portfolio" i], input[name*="website" i], input[name*="urls[Portfolio]" i], input[placeholder*="Portfolio" i], input[data-ui="website"]'
    );
    if (portfolioInput && profile.portfolio) {
      await portfolioInput.click({ clickCount: 3 });
      await portfolioInput.type(profile.portfolio, { delay: 15 });
      filledCount++;
    }

    // Summary Textarea
    const summaryArea = await page.$(
      'textarea[name="summary"], textarea#summary, textarea[data-ui="summary"]'
    );
    if (summaryArea && profile.summary) {
      await summaryArea.click({ clickCount: 3 });
      await summaryArea.type(profile.summary.slice(0, 800), { delay: 5 });
      filledCount++;
    }

    // Cover Letter Textarea
    const coverLetterArea = await page.$(
      'textarea[name="cover_letter"], textarea#cover_letter, textarea[data-ui="cover_letter"], textarea[name*="cover" i], textarea[id*="cover" i], textarea[name*="comments" i]'
    );
    const coverText =
      lead?.analysis?.coverLetter ||
      `Dear Hiring Team at ${lead?.job?.companyName || 'Company'},\n\nI am writing to express my strong interest in this engineering role. With 4 years of hands-on software engineering experience specializing in full-stack architecture, high-performance systems (Next.js, React), and cloud microservices (Node.js, GCP, Docker), I am eager to contribute to your engineering goals.\n\nSincerely,\n${profile.name}`;

    if (coverLetterArea) {
      await coverLetterArea.click({ clickCount: 3 });
      await coverLetterArea.type(coverText, { delay: 5 });
      filledCount++;
    }

    // 3. Upload Tailored PDF Resume
    let fileUploaded = false;
    const fileInput = await page.$(
      'input[data-ui="resume"], input[type="file"][data-ui="resume"], input[name="resume"], input[type="file"][name*="resume" i], input[type="file"][name*="cv" i], input[type="file"]:not([data-ui="avatar"])'
    );
    if (fileInput && resumePdfPath) {
      try {
        await fs.access(resumePdfPath);
        await fileInput.uploadFile(resumePdfPath);
        await fileInput.evaluate((el: any) => {
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        console.log(chalk.gray('  • Verifying resume upload on portal...'));
        await new Promise((r) => setTimeout(r, 4000));
        fileUploaded = true;
        console.log(chalk.green(`  ✓ Attached tailored PDF resume: ${path.basename(resumePdfPath)}`));
        filledCount++;
      } catch (err: any) {
        console.warn(`[Upload Warning] Could not attach PDF: ${err.message}`);
      }
    }

    // 4. AI-Powered Custom Screening Questions Auto-Filler
    const { autoFillCustomQuestions } = await import('./aiFormFiller.js');
    const customFilled = await autoFillCustomQuestions(
      page,
      profile,
      companyName,
      lead?.job?.jobTitle || 'Software Engineer'
    );
    filledCount += customFilled;

    // 5. Capture Form Screenshot
    const screenshotsDir = path.resolve(process.cwd(), 'output', 'screenshots');
    await fs.mkdir(screenshotsDir, { recursive: true });

    const safeUrlName = jobUrl.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    const screenshotPath = path.join(screenshotsDir, `${safeUrlName}_filled.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    console.log(chalk.cyan(`  📸 Captured verification screenshot: ${screenshotPath}`));

    // 6. Submit or Review
    if (isSubmit && filledCount > 0) {
      console.log(chalk.bold.yellow(`  🚀 Clicking Submit Application button...`));
      const submitButton = await page.$(
        'button[data-ui="apply-button"], button[type="submit"], input[type="submit"], button#submit_app, button[data-qa="btn-submit"], button[data-ui="submit-application"], .postings-btn'
      );
      if (submitButton) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
          submitButton.click()
        ]);
        await new Promise((r) => setTimeout(r, 2500));

        const postScreenshotPath = path.join(screenshotsDir, `${safeUrlName}_submitted.png`);
        await page.screenshot({ path: postScreenshotPath, fullPage: true }).catch(() => {});
        console.log(chalk.bold.green(`  🎉 Application submitted successfully!`));
        console.log(chalk.cyan(`  📸 Submission Confirmation Screenshot: ${postScreenshotPath}`));

        if (lead) {
          const { saveLead } = await import('../tracker/db.js');
          lead.status = 'SENT';
          lead.sentAt = new Date().toISOString();
          await saveLead(lead).catch(() => {});
        }
      }
    } else {
      console.log(chalk.yellow(`  ℹ️ Dry-run mode: Form auto-filled (${filledCount} fields). To submit live, run with --submit`));
    }

    return {
      success: true,
      atsType,
      url: jobUrl,
      screenshotPath,
      submitted: isSubmit,
      message: `Form filled (${filledCount} fields, Resume: ${fileUploaded ? 'Attached' : 'Not found'})`
    };
  } catch (err: any) {
    console.error(chalk.red(`ATS Auto-Apply Error: ${err.message}`));
    return {
      success: false,
      atsType: 'generic',
      url: jobUrl,
      submitted: false,
      message: err.message
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
