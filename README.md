# 🚀 JobFinder Pro

**JobFinder Pro** is an automated, AI-powered job outreach and application engine designed to help **Abdurrahman Hassan** target hundreds of relevant software engineering positions.

It autonomously crawls company websites and career pages, extracts Job Descriptions (JDs), discovers decision-maker contacts (via Apollo.io or page scraping), dynamically tailors the resume and cover letter to guarantee an **ATS Match Score > 8/10**, renders a clean PDF resume, and drafts/sends personalized outreach via Gmail with full CRM tracking.

---

## 🌟 Key Features

1. **Sitemap & Career Page Web Crawler**:
   - Crawls `sitemap.xml`, `robots.txt`, common career paths (`/careers`, `/jobs`, `/open-roles`), and ATS providers (Greenhouse, Lever, Ashby, Workable).
2. **Decision Maker & Email Discovery**:
   - **Apollo.io API**: Queries verified Engineering Managers, VP of Engineering, Technical Recruiters, and Founders.
   - **Page Extractor**: Intelligent regex and mailto extractor with anti-asset noise filtering.
3. **Runtime AI ATS Tailoring Engine (> 8/10 Score)**:
   - Evaluates keyword density and tech stack overlap.
   - Tailors the **Professional Summary** and **Technical Skills** to directly match the target role.
   - Re-prioritizes bullet points to highlight the most relevant achievements (e.g. Next.js, NestJS, MCP, GCP, Microservices).
   - Generates a concise, high-converting **4-Sentence Cold Outreach Email** + full Cover Letter.
4. **Instant ATS-Compliant PDF Resume Compiler**:
   - Compiles a modern, single-page/two-page PDF using Puppeteer to `output/resumes/`.
5. **Gmail App Password Integration with Dry-Run Safety**:
   - Default `DRY_RUN=true` allows you to review drafts in `output/drafts/` before sending.
   - Built-in rate limiting and anti-spam protection.
6. **Local CRM Tracker**:
   - Saves all applications to `output/database.json` and exports a spreadsheet to `output/job_leads.csv`.

---

## 🛠️ Setup & Configuration

### 1. Configure `.env`
Edit `.env` in the root folder:

```env
# Gmail App Password (Google Account > Security > 2-Step Verification > App Passwords)
GMAIL_USER=abdurfreelance@gmail.com
GMAIL_APP_PASSWORD=your_16_digit_app_password

# Safety Controls
DRY_RUN=true

# (Optional) Apollo.io API Key for verified Decision Maker discovery
APOLLO_API_KEY=

# (Optional) Local Ollama LLM
USE_OLLAMA=false
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

---

## 🎯 Usage Commands

### 1. Process a Single Career Page or Job URL
```bash
npm run process -- https://jobs.lever.co/company-name
# or
npx tsx src/cli.ts process https://company.com/careers
```

### 2. Process a Bulk List of Targets
Add company URLs to `targets.txt` (one per line) and run:
```bash
npm run bulk -- targets.sample.txt
```

### 3. View CRM Stats & Match Scores
```bash
npm run stats
```

### 4. Send Approved Drafts
When you are ready to send the drafted applications:
```bash
npx tsx src/cli.ts send-approved
```

---

## 📂 Output Folder Structure

- `output/resumes/` — Generated tailored PDF resumes (`Abdurrahman_Hassan_[Company].pdf`)
- `output/drafts/` — Generated cold outreach emails & cover letters
- `output/database.json` — Complete JSON record of all processed targets
- `output/job_leads.csv` — CSV spreadsheet of all applications for Excel/Google Sheets
