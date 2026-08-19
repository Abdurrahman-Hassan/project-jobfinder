import fs from 'fs/promises';
import path from 'path';
import { CandidateProfile, ATSAnalysis } from '../types/index.js';
import { launchManagedBrowser } from '../utils/browserManager.js';

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function generateResumePdf(
  profile: CandidateProfile,
  analysis: ATSAnalysis,
  companyName: string
): Promise<string> {
  const outputDir = path.resolve(process.cwd(), 'output', 'resumes');
  await fs.mkdir(outputDir, { recursive: true });

  const sanitizedCompany = companyName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const pdfFileName = `${profile.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${sanitizedCompany}.pdf`;
  const pdfPath = path.join(outputDir, pdfFileName);

  const templatePath = path.resolve(process.cwd(), 'src', 'pdf', 'template.html');
  let html = await fs.readFile(templatePath, 'utf-8');

  // Replace basic fields with HTML entity escaping & length clamping
  const clampedSummary =
    analysis.tailoredSummary.length > 450
      ? analysis.tailoredSummary.slice(0, 447) + '...'
      : analysis.tailoredSummary;

  html = html.replace(/{{name}}/g, escapeHtml(profile.name));
  html = html.replace(/{{location}}/g, escapeHtml(profile.location));
  html = html.replace(/{{phone}}/g, escapeHtml(profile.phone));
  html = html.replace(/{{email}}/g, escapeHtml(profile.email));
  html = html.replace(/{{linkedin}}/g, escapeHtml(profile.linkedin));
  html = html.replace(/{{github}}/g, escapeHtml(profile.github));
  html = html.replace(/{{portfolio}}/g, escapeHtml(profile.portfolio));
  html = html.replace(/{{summary}}/g, escapeHtml(clampedSummary));

  // Replace Skills section
  let skillsHtml = '';
  for (const cat of analysis.tailoredSkills) {
    const escapedSkills = (cat.skills || []).map((s) => escapeHtml(s)).join(', ');
    skillsHtml += `<div class="skill-cat">• ${escapeHtml(cat.category)}:</div><div class="skill-items">${escapedSkills}</div>\n`;
  }
  html = html.replace(/{{#skills}}[\s\S]*?{{\/skills}}/, skillsHtml);

  // Replace Experiences section (clamped to prevent awkward page splits)
  let expHtml = '';
  for (const exp of analysis.tailoredExperiences) {
    const bulletsHtml = (exp.bullets || [])
      .slice(0, 4)
      .map((b) => `<li>${escapeHtml(b)}</li>`)
      .join('\n');
    expHtml += `
      <div class="job-entry">
        <div class="job-header">
          <div><span class="job-role">${escapeHtml(exp.role)}</span> — <span class="job-company">${escapeHtml(exp.company)}</span> (${escapeHtml(exp.location)})</div>
          <div class="job-period">${escapeHtml(exp.period)}</div>
        </div>
        <ul>
          ${bulletsHtml}
        </ul>
      </div>
    `;
  }
  html = html.replace(/{{#experiences}}[\s\S]*?{{\/experiences}}/, expHtml);

  // Replace Projects section
  let projHtml = '';
  for (const proj of (profile.keyProjects || []).slice(0, 3)) {
    projHtml += `
      <div class="project-entry">
        <span class="project-title">${escapeHtml(proj.name)}</span> (<em>${escapeHtml((proj.technologies || []).join(', '))}</em>):
        <span class="project-desc">${escapeHtml(proj.description)}</span>
      </div>
    `;
  }
  html = html.replace(/{{#projects}}[\s\S]*?{{\/projects}}/, projHtml);

  // Launch browser via centralized browser manager
  const browser = await launchManagedBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '12mm',
        bottom: '12mm',
        left: '12mm',
        right: '12mm'
      }
    });
  } finally {
    await browser.close();
  }

  return pdfPath;
}
