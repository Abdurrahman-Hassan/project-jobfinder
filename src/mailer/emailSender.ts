import fs from 'fs/promises';
import path from 'path';
import nodemailer from 'nodemailer';
import { ProcessedJobLead } from '../types/index.js';
import { isValidEmail, sanitizeHeaderString } from '../validation/schemas.js';
import { getActiveProfile } from '../config/profile.js';
import { verifyDomainHasMx } from '../enrichment/emailExtractor.js';

export async function verifySmtpConnection(): Promise<boolean> {
  const gmailUser = process.env.GMAIL_USER || process.env.EMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS;

  if (!gmailUser || !gmailPass) {
    console.error('[SMTP Error] Missing GMAIL_USER or GMAIL_APP_PASSWORD in .env.');
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass
    }
  });

  try {
    await transporter.verify();
    return true;
  } catch (err: any) {
    console.error(`[SMTP Error] Verification failed: ${err.message}`);
    return false;
  }
}

/**
 * Validates, cleans, and sanitizes recipient email.
 * Replaces dummy/template addresses with verified domain fallback.
 * Checks DNS MX records to prevent "Address not found" 550 bounces.
 */
export async function sanitizeAndValidateRecipient(
  rawEmail?: string,
  domain?: string
): Promise<{ valid: boolean; email: string; reason?: string }> {
  const BLOCKED_PREFIXES = [
    'you@',
    'user@',
    'name@',
    'test@',
    'sample@',
    'email@',
    'noreply@',
    'no-reply@',
    'admin@',
    'webmaster@',
    'abuse@'
  ];

  const BLOCKED_DOMAINS = [
    'example.com',
    'domain.com',
    'company.com',
    'mycompany.com',
    'sentry.io',
    'wixpress.com',
    'arbeitnow.com',
    'remotive.com',
    'jobicy.com',
    'greenhouse.io',
    'lever.co',
    'ashbyhq.com',
    'workable.com'
  ];

  let candidate = (rawEmail || '').trim().toLowerCase().replace(/[\r\n\t]/g, '');

  const isBlocked =
    !candidate ||
    BLOCKED_PREFIXES.some((p) => candidate.startsWith(p)) ||
    BLOCKED_DOMAINS.some((d) => candidate.endsWith(`@${d}`) || candidate === d);

  if (isBlocked) {
    if (domain && !BLOCKED_DOMAINS.includes(domain)) {
      candidate = `hello@${domain.replace(/^www\./, '')}`;
    } else {
      return { valid: false, email: candidate, reason: `Blocked or placeholder email: "${rawEmail}"` };
    }
  }

  if (!isValidEmail(candidate)) {
    return { valid: false, email: candidate, reason: `Invalid email format: "${candidate}"` };
  }

  // Verify MX mail servers for recipient domain
  const recipientDomain = candidate.split('@')[1];
  const hasMx = await verifyDomainHasMx(recipientDomain);
  if (!hasMx) {
    return {
      valid: false,
      email: candidate,
      reason: `Domain "${recipientDomain}" has no active MX mail records (would bounce: Address not found)`
    };
  }

  return { valid: true, email: candidate };
}

/**
 * Clean subject and body from template artifacts & CRLF header injection.
 */
export function sanitizeContent(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[(?:Name|Team|Company|Your Name|Recipient)\]/gi, '')
    .replace(/\b(?:undefined|NaN|null)\b/g, '')
    .trim();
}

export async function sendOrDraftEmail(lead: ProcessedJobLead): Promise<{
  success: boolean;
  mode: 'SENT' | 'DRAFTED';
  draftPath?: string;
  error?: string;
}> {
  const isDryRun = process.env.DRY_RUN !== 'false';
  const profile = getActiveProfile();
  const gmailUser = process.env.GMAIL_USER || process.env.EMAIL_USER || profile.email;
  const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS;

  // 1. Recipient Sanitization & MX Verification
  const { valid, email: recipient, reason } = await sanitizeAndValidateRecipient(
    lead.job.contactEmail,
    lead.job.companyDomain
  );

  // Update lead with sanitized recipient
  lead.job.contactEmail = recipient || lead.job.contactEmail;

  // 2. Subject and Body Sanitization
  const rawSubject = lead.analysis.coldEmailSubject || `Application for ${lead.job.jobTitle} — ${profile.name}`;
  const subject = sanitizeHeaderString(sanitizeContent(rawSubject));
  const body = sanitizeContent(lead.analysis.coldEmailBody);

  // 3. Dry Run / Draft Mode
  if (isDryRun || !gmailPass) {
    const draftsDir = path.resolve(process.cwd(), 'output', 'drafts');
    await fs.mkdir(draftsDir, { recursive: true });

    const sanitizedCompany = lead.job.companyName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const draftFileName = `${sanitizedCompany}_outreach.txt`;
    const draftPath = path.join(draftsDir, draftFileName);

    const deliveryHeader = valid
      ? `TO: ${recipient} (${lead.job.contactName || 'Hiring Team'})`
      : `TO: ${recipient || 'UNVERIFIED'} (${lead.job.contactName || 'Hiring Team'}) [REVIEW REQUIRED: ${reason}]`;

    const draftContent = `=====================================================
${deliveryHeader}
ROLE: ${lead.job.jobTitle} at ${lead.job.companyName}
ATS MATCH SCORE: ${lead.analysis.matchScore}/10
MATCHED KEYWORDS: ${lead.analysis.matchingKeywords.join(', ')}
ATTACHED RESUME: ${lead.resumePdfPath || 'None'}
=====================================================
SUBJECT: ${subject}

${body}

=====================================================
COVER LETTER PREVIEW:
${lead.analysis.coverLetter}
`;

    await fs.writeFile(draftPath, draftContent, 'utf-8');
    lead.emailDraftPath = draftPath;
    lead.status = valid ? 'TAILORED' : 'FAILED';
    if (!valid) lead.error = reason;

    return {
      success: valid,
      mode: 'DRAFTED',
      draftPath,
      error: valid ? undefined : reason
    };
  }

  if (!valid) {
    return {
      success: false,
      mode: 'DRAFTED',
      error: reason || 'Invalid recipient email'
    };
  }

  // 4. Live Sending Mode via Nodemailer Gmail
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass
    }
  });

  const attachments: any[] = [];
  if (lead.resumePdfPath) {
    try {
      const stats = await fs.stat(lead.resumePdfPath);
      if (stats.size > 500) {
        attachments.push({
          filename: `${profile.name.replace(/\s+/g, '_')}_Resume.pdf`,
          path: lead.resumePdfPath
        });
      }
    } catch {
      console.warn(`[Mailer Warning] Resume PDF file not found at ${lead.resumePdfPath}, sending without attachment.`);
    }
  }

  try {
    await transporter.sendMail({
      from: `"${profile.name}" <${gmailUser}>`,
      replyTo: profile.email,
      to: recipient,
      subject,
      text: body,
      attachments
    });

    lead.status = 'SENT';
    lead.sentAt = new Date().toISOString();

    return {
      success: true,
      mode: 'SENT'
    };
  } catch (err: any) {
    lead.status = 'FAILED';
    lead.error = err.message;
    return {
      success: false,
      mode: 'DRAFTED',
      error: err.message
    };
  }
}
