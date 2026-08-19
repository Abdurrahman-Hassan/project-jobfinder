import fs from 'fs/promises';
import path from 'path';
import nodemailer from 'nodemailer';
import { ProcessedJobLead } from '../types/index.js';
import { isValidEmail, sanitizeHeaderString } from '../validation/schemas.js';

export async function verifySmtpConnection(): Promise<boolean> {
  if (process.env.DRY_RUN !== 'false') return true;

  const gmailUser = process.env.GMAIL_USER || process.env.EMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS;

  if (!gmailUser || !gmailPass) {
    console.error('[SMTP Error] Missing GMAIL_USER or GMAIL_APP_PASSWORD in environment.');
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

export async function sendOrDraftEmail(lead: ProcessedJobLead): Promise<{
  success: boolean;
  mode: 'SENT' | 'DRAFTED';
  draftPath?: string;
  error?: string;
}> {
  const isDryRun = process.env.DRY_RUN !== 'false';
  const gmailUser = process.env.GMAIL_USER || process.env.EMAIL_USER || 'abdurfreelance@gmail.com';
  const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS;

  const rawRecipient =
    lead.job.contactEmail || `careers@${lead.job.companyDomain || 'company.com'}`;
  
  // Header Injection Defense & Email Validation
  const recipient = sanitizeHeaderString(rawRecipient);
  const subject = sanitizeHeaderString(
    lead.analysis.coldEmailSubject || `Application for ${lead.job.jobTitle}`
  );
  const body = lead.analysis.coldEmailBody;

  if (!isValidEmail(recipient)) {
    return {
      success: false,
      mode: 'DRAFTED',
      error: `Invalid recipient email address format: "${recipient}"`
    };
  }

  // 1. Dry Run / Draft Mode
  if (isDryRun || !gmailPass) {
    const draftsDir = path.resolve(process.cwd(), 'output', 'drafts');
    await fs.mkdir(draftsDir, { recursive: true });

    const sanitizedCompany = lead.job.companyName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const draftFileName = `${sanitizedCompany}_outreach.txt`;
    const draftPath = path.join(draftsDir, draftFileName);

    const draftContent = `=====================================================
TO: ${recipient} (${lead.job.contactName || 'Hiring Team'})
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
    lead.status = 'TAILORED';

    return {
      success: true,
      mode: 'DRAFTED',
      draftPath
    };
  }

  // 2. Live Sending Mode via Nodemailer Gmail
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
      await fs.access(lead.resumePdfPath);
      attachments.push({
        filename: path.basename(lead.resumePdfPath),
        path: lead.resumePdfPath
      });
    } catch {
      console.warn(`[Mailer Warning] Resume PDF file not found at ${lead.resumePdfPath}, sending without attachment.`);
    }
  }

  try {
    await transporter.sendMail({
      from: `"${sanitizeHeaderString(lead.analysis.coldEmailSubject.split('-').pop()?.trim() || 'Candidate')}" <${gmailUser}>`,
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
