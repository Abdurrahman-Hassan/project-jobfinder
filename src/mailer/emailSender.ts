import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import { ProcessedJobLead } from '../types/index.js';

export async function sendOrDraftEmail(lead: ProcessedJobLead): Promise<{
  success: boolean;
  mode: 'SENT' | 'DRAFTED';
  draftPath?: string;
  error?: string;
}> {
  const isDryRun = process.env.DRY_RUN !== 'false';
  const gmailUser = process.env.GMAIL_USER || 'abdurfreelance@gmail.com';
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  const recipient = lead.job.contactEmail || `careers@${lead.job.companyDomain || 'company.com'}`;
  const subject = lead.analysis.coldEmailSubject;
  const body = lead.analysis.coldEmailBody;

  // Always write the draft file to output/drafts
  const draftsDir = path.resolve(process.cwd(), 'output', 'drafts');
  await fs.mkdir(draftsDir, { recursive: true });

  const sanitizedCompany = lead.job.companyName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const draftPath = path.join(draftsDir, `${sanitizedCompany}_outreach.txt`);

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
COVER LETTER:
${lead.analysis.coverLetter}
=====================================================
`;

  await fs.writeFile(draftPath, draftContent, 'utf-8');

  // If Dry Run or no password set, return drafted status
  if (isDryRun || !gmailPass) {
    return {
      success: true,
      mode: 'DRAFTED',
      draftPath
    };
  }

  // Live Sending via Gmail App Password
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass
      }
    });

    const attachments = [];
    if (lead.resumePdfPath) {
      attachments.push({
        filename: path.basename(lead.resumePdfPath),
        path: lead.resumePdfPath
      });
    }

    await transporter.sendMail({
      from: `"Abdurrahman Hassan" <${gmailUser}>`,
      to: recipient,
      subject: subject,
      text: body,
      attachments: attachments
    });

    return {
      success: true,
      mode: 'SENT',
      draftPath
    };
  } catch (error: any) {
    return {
      success: false,
      mode: 'DRAFTED',
      draftPath,
      error: error.message
    };
  }
}
