import fs from 'fs/promises';
import path from 'path';
import { ProcessedJobLead } from '../types/index.js';

const DB_PATH = path.resolve(process.cwd(), 'output', 'database.json');
const CSV_PATH = path.resolve(process.cwd(), 'output', 'job_leads.csv');

export async function getStoredLeads(): Promise<ProcessedJobLead[]> {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    try {
      return JSON.parse(data);
    } catch (parseErr: any) {
      console.warn(`[DB Warning] Failed to parse database.json: ${parseErr.message}. Backing up corrupted file.`);
      const backupPath = `${DB_PATH}.corrupted.${Date.now()}`;
      await fs.writeFile(backupPath, data, 'utf-8').catch(() => {});
      return [];
    }
  } catch {
    return [];
  }
}

export async function getTodaySentCount(): Promise<number> {
  const leads = await getStoredLeads();
  const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  return leads.filter((l) => {
    if (l.status === 'SENT' && l.sentAt) {
      return l.sentAt.startsWith(todayStr);
    }
    return false;
  }).length;
}

export async function isDuplicateLead(
  companyDomain?: string,
  contactEmail?: string
): Promise<{ isDuplicate: boolean; reason?: string }> {
  const leads = await getStoredLeads();
  const cleanDomain = (companyDomain || '').toLowerCase().replace(/^www\./, '');
  const cleanEmail = (contactEmail || '').toLowerCase().trim();

  const GENERIC_DOMAINS = [
    'arbeitnow.com',
    'remotive.com',
    'workable.com',
    'company.com',
    'careers.com',
    'jobs.com',
    'linkedin.com',
    'indeed.com'
  ];

  // If the target is a generic job board domain, do not treat it as a duplicate
  if (GENERIC_DOMAINS.includes(cleanDomain)) {
    return { isDuplicate: false };
  }

  for (const lead of leads) {
    const leadDomain = (lead.job?.companyDomain || '').toLowerCase().replace(/^www\./, '');
    const leadEmail = (lead.job?.contactEmail || '').toLowerCase().trim();

    // Check domain match
    if (cleanDomain && leadDomain && !GENERIC_DOMAINS.includes(leadDomain) && cleanDomain === leadDomain) {
      return {
        isDuplicate: true,
        reason: `Company domain "${cleanDomain}" was already processed on ${new Date(lead.createdAt).toLocaleDateString()} (Status: ${lead.status})`
      };
    }

    // Check email match (ignore generic support/careers when domain differs)
    if (
      cleanEmail &&
      leadEmail &&
      cleanEmail === leadEmail &&
      !cleanEmail.startsWith('support@') &&
      !cleanEmail.startsWith('careers@') &&
      !cleanEmail.startsWith('hiring@')
    ) {
      return {
        isDuplicate: true,
        reason: `Contact email "${cleanEmail}" was already contacted on ${new Date(lead.createdAt).toLocaleDateString()}`
      };
    }
  }

  return { isDuplicate: false };
}

export async function saveLead(lead: ProcessedJobLead): Promise<void> {
  const outputDir = path.resolve(process.cwd(), 'output');
  await fs.mkdir(outputDir, { recursive: true });

  const existingLeads = await getStoredLeads();
  const index = existingLeads.findIndex((l) => l.id === lead.id);

  if (index >= 0) {
    existingLeads[index] = lead;
  } else {
    existingLeads.unshift(lead);
  }

  // Atomic Write for JSON DB
  const tempDbPath = `${DB_PATH}.tmp.${Date.now()}`;
  await fs.writeFile(tempDbPath, JSON.stringify(existingLeads, null, 2), 'utf-8');
  await fs.rename(tempDbPath, DB_PATH);

  await exportToCsv(existingLeads);
}

async function exportToCsv(leads: ProcessedJobLead[]): Promise<void> {
  const headers = [
    'ID',
    'Company',
    'Role',
    'ATS Score',
    'Recipient Email',
    'Recipient Name',
    'Status',
    'Created At',
    'Sent At',
    'Job URL',
    'Resume PDF Path'
  ];

  const rows = leads.map((l) => [
    `"${l.id}"`,
    `"${(l.job?.companyName || '').replace(/"/g, '""')}"`,
    `"${(l.job?.jobTitle || '').replace(/"/g, '""')}"`,
    `"${l.analysis?.matchScore || 0}"`,
    `"${l.job?.contactEmail || ''}"`,
    `"${l.job?.contactName || ''}"`,
    `"${l.status}"`,
    `"${l.createdAt}"`,
    `"${l.sentAt || ''}"`,
    `"${l.job?.url || ''}"`,
    `"${(l.resumePdfPath || '').replace(/\\/g, '/')}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  // Atomic Write for CSV
  const tempCsvPath = `${CSV_PATH}.tmp.${Date.now()}`;
  await fs.writeFile(tempCsvPath, csvContent, 'utf-8');
  await fs.rename(tempCsvPath, CSV_PATH);
}
