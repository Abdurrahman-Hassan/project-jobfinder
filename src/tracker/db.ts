import fs from 'fs/promises';
import path from 'path';
import { ProcessedJobLead } from '../types/index.js';

const DB_PATH = path.resolve(process.cwd(), 'output', 'database.json');
const CSV_PATH = path.resolve(process.cwd(), 'output', 'job_leads.csv');

export async function getStoredLeads(): Promise<ProcessedJobLead[]> {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
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

  await fs.writeFile(DB_PATH, JSON.stringify(existingLeads, null, 2), 'utf-8');
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
    `"${l.job.companyName}"`,
    `"${l.job.jobTitle.replace(/"/g, '""')}"`,
    `"${l.analysis.matchScore}"`,
    `"${l.job.contactEmail || ''}"`,
    `"${l.job.contactName || ''}"`,
    `"${l.status}"`,
    `"${l.createdAt}"`,
    `"${l.sentAt || ''}"`,
    `"${l.job.url}"`,
    `"${l.resumePdfPath || ''}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  await fs.writeFile(CSV_PATH, csvContent, 'utf-8');
}
