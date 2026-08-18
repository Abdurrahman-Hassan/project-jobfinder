import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import { CandidateProfile, ATSAnalysis } from '../types/index.js';

export async function generateResumePdf(
  profile: CandidateProfile,
  analysis: ATSAnalysis,
  companyName: string
): Promise<string> {
  const outputDir = path.resolve(process.cwd(), 'output', 'resumes');
  await fs.mkdir(outputDir, { recursive: true });

  const sanitizedCompany = companyName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const pdfFileName = `Abdurrahman_Hassan_${sanitizedCompany}.pdf`;
  const pdfPath = path.join(outputDir, pdfFileName);

  const templatePath = path.resolve(process.cwd(), 'src', 'pdf', 'template.html');
  let html = await fs.readFile(templatePath, 'utf-8');

  // Replace basic fields
  html = html.replace(/{{name}}/g, profile.name);
  html = html.replace(/{{location}}/g, profile.location);
  html = html.replace(/{{phone}}/g, profile.phone);
  html = html.replace(/{{email}}/g, profile.email);
  html = html.replace(/{{linkedin}}/g, profile.linkedin);
  html = html.replace(/{{github}}/g, profile.github);
  html = html.replace(/{{portfolio}}/g, profile.portfolio);
  html = html.replace(/{{summary}}/g, analysis.tailoredSummary);

  // Replace Skills section
  let skillsHtml = '';
  for (const cat of analysis.tailoredSkills) {
    skillsHtml += `<div class="skill-cat">• ${cat.category}:</div><div class="skill-items">${cat.skills.join(', ')}</div>\n`;
  }
  html = html.replace(/{{#skills}}[\s\S]*?{{\/skills}}/, skillsHtml);

  // Replace Experiences section
  let expHtml = '';
  for (const exp of analysis.tailoredExperiences) {
    const bulletsHtml = exp.bullets.map((b) => `<li>${b}</li>`).join('\n');
    expHtml += `
      <div class="job-entry">
        <div class="job-header">
          <div><span class="job-role">${exp.role}</span> — <span class="job-company">${exp.company}</span> (${exp.location})</div>
          <div class="job-period">${exp.period}</div>
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
  for (const proj of profile.keyProjects.slice(0, 3)) {
    projHtml += `
      <div class="project-entry">
        <span class="project-title">${proj.name}</span> (<em>${proj.technologies.join(', ')}</em>):
        <span class="project-desc">${proj.description}</span>
      </div>
    `;
  }
  html = html.replace(/{{#projects}}[\s\S]*?{{\/projects}}/, projHtml);

  // Detect installed browser path if available
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];

  let executablePath: string | undefined = undefined;
  for (const p of possiblePaths) {
    try {
      await fs.access(p);
      executablePath = p;
      break;
    } catch {
      // ignore
    }
  }

  // Launch browser to render PDF
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

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
