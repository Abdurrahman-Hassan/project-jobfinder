# 🚀 JobFinder Pro

> **100% Autonomous AI Job Sourcing, ATS Form Auto-Submitter, Tailored Resume Compiler & Cold Outreach Engine.**

JobFinder Pro automates the entire software engineering job application workflow from discovery to live submission. It finds direct ATS openings on **Workable, Greenhouse, Lever, Ashby, SmartRecruiters, and Breezy HR**, dynamically tailors ATS-optimized PDF resumes for each specific role, answers custom employer screening questions using AI in natural human language, and submits applications directly to the employer's portal with full verification screenshots.

---

## 🌟 Key Capabilities

```
                  ┌─────────────────────────────────────────────────────────┐
                  │                 JobFinder Pro Pipeline                  │
                  └─────────────────────────────────────────────────────────┘
                                               │
               ┌───────────────────────────────┴───────────────────────────────┐
               ▼                                                               ▼
   🌐 Autonomous Discovery                                            🤖 Intelligent Execution
  • Cascading Search Engine:                                          • Deep JD Analysis & ATS Scoring (> 9.0/10)
    1. Bing ATS (Zero CAPTCHA)                                        • Custom PDF Resume Compilation
    2. DuckDuckGo (Fresh Remote Listings)                             • AI Screening Question Answering
    3. Google (Last Resort Fallback)                                  • Live Multi-Portal Form Auto-Submission
  • Multi-Engine ATS Detection                                        • DNS MX-Verified Email Cold Outreach
    (Workable, Greenhouse, Lever, Ashby)                              • Full-Page Proof Screenshot Capture
```

### 1. 🤖 100% Autonomous ATS Form Auto-Submitter
* **Zero Manual Form Filling:** Automatically routes to the application form and populates all standard fields (First Name, Last Name, Email, Phone, Location, Portfolio, LinkedIn, GitHub, Headline, Summary, Cover Letter).
* **Multi-Portal Support:** Supports **Workable, Greenhouse, Lever, Ashby, SmartRecruiters, Breezy HR**, and direct company career pages.
* **React State & S3 Upload Handling:** Dispatches synthetic events to bind files into modern React SPAs and waits for AWS S3 upload completion before submission.
* **Visual Verification:** Captures high-resolution full-page screenshots of filled forms saved in `output/screenshots/`.

### 2. 🧠 AI-Powered Screening Question Answering
* **Dynamic Form Inspection:** Scans the page DOM for custom screening questions, dropdowns, radio buttons, and textareas.
* **Intelligent Boolean & Skill Matching:** Automatically handles authorizations, work eligibility, start dates, and technology experience radios (`YES/NO`).
* **Natural Human Language Generator:** Generates authentic, concise, high-converting responses for custom open-ended questions (*"Why do you want to join us?"*, *"Describe your experience with Next.js/microservices"*, *"Salary expectations"*).

### 3. 📄 Runtime ATS Resume Tailoring (> 9/10 Match Score)
* **Keyword Optimization:** Matches keywords between the job description and candidate experience.
* **Dynamic PDF Compilation:** Uses Headless Chromium to compile professional, single-page/two-page ATS-compliant PDF resumes in `output/resumes/`.

### 4. 🔍 Smart Cascading Search Engine
* **Bing First:** Discovers direct ATS job links without triggering bot verification.
* **DuckDuckGo Second:** Supplemented for fresh remote roles.
* **Google Last Resort:** Only queried if earlier engines return fewer results than requested.

### 5. 🛡️ DNS MX Deliverability Guard
* **Zero Bounce Guarantee:** Queries live DNS MX records (`dns.resolveMx()`) on target recipient domains before sending cold outreach emails to completely prevent `550 Address Not Found` bouncebacks.

---

## ⚡ Quick Start (3-Minute Setup)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/Abdurrahman-Hassan/project-jobfinder.git
cd project-jobfinder
npm install
```

### 2. Configure Environment Variables (`.env`)
Create or edit `.env` in the root directory:

```env
# Gmail App Password (Google Account > Security > 2-Step Verification > App Passwords)
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_16_digit_app_password

# Safety Controls (set to true to draft emails before sending)
DRY_RUN=true

# (Optional) OpenRouter / LLM Key for Custom AI Question Answering & Tailoring
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free

# (Optional) Apollo.io API Key for Hiring Manager Discovery
APOLLO_API_KEY=your_apollo_key

# (Optional) Cloudflare Browser Rendering API (Falls back to local stealth browser if omitted)
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
```

### 3. Add Your Resume & Candidate Profile

You have 3 easy ways to set up your profile:

#### Option A: Auto-Import from PDF (Recommended)
Place your existing resume PDF in the `resumes/` folder or pass its path:
```bash
# Ingest PDF and automatically generate src/config/profile.json
npm run import-cv -- path/to/your_resume.pdf

# Or place it in resumes/ and run:
npm run import-cv
```

#### Option B: Configure via JSON
Copy the example profile and edit your details:
```bash
cp src/config/profile.example.json src/config/profile.json
```
*(Fill in your real name, email, phone, skills, and past work history. `profile.json` is git-ignored and never committed).*

---

### 💡 How JobFinder Pro Uses Your Resume
1. **Extraction & Baseline:** When you run `import-cv`, the PDF parser extracts your contact info, skill categories, projects, and work history.
2. **Runtime Tailoring:** When targeting a job, JobFinder compares the target Job Description (JD) with your profile, matches key technologies, and rewrites the professional summary and experience highlights specifically for that employer.
3. **Automated PDF Compilation:** Compiles a clean, tailored PDF resume (`output/resumes/<YourName>_<Company>.pdf`).
4. **Auto-Attachment:** Automatically uploads the tailored PDF to Workable, Greenhouse, Lever, and Ashby forms, and attaches it to cold outreach emails.

---

## 🎮 Command Cheatsheet

### 🚀 1. Fully Autonomous Job Application (Search ➔ Tailor ➔ Live Submit)
Finds live ATS jobs, tailors custom resumes, answers all screening questions with AI, and submits live applications:
```bash
# Live submit to 10 remote Next.js jobs
npm run auto-apply -- -l 10 -r "Remote" "Next.js Full Stack"

# Dry-run test (fills forms and saves verification screenshots without submitting)
npm run auto-apply:dry -- -l 5 -r "Remote" "Next.js engineer"
```

---

### 🎯 2. Apply to a Specific Job URL (Workable, Greenhouse, Lever, Ashby)
```bash
# Live submission with AI form filling & tailored PDF resume
npm run apply:submit -- "https://apply.workable.com/company/j/job-id/"

# Review mode / Dry run (fills form and captures screenshot)
npm run apply -- "https://jobs.lever.co/company/job-id"
```

---

### 🔍 3. Discover & Tailor Resumes in Bulk (`ats-hunt`)
Discovers direct ATS openings and compiles tailored PDF resumes in `output/resumes/`:
```bash
npm run ats-hunt -- -l 20 -r "Remote" "Frontend React Developer"

# With optional auto-fill
npm run ats-hunt -- -l 10 -r "Worldwide" -a "Full Stack Engineer"
```

---

### 🏢 4. Target Direct Companies (`company-hunt`)
Crawls company career pages, discovers hiring manager emails via Apollo.io, and drafts personalized outreach pitches:
```bash
npm run company-hunt -- -l 15 "SaaS software agencies remote"
```

---

### ✉️ 5. Email Cold Outreach & Deliverability
```bash
# Verify Gmail SMTP connection and credentials
npm run test-email

# Send approved drafts from output/drafts/ (with DNS MX validation)
npm run send
```

---

### 📊 6. View CRM Analytics & Job Tracker
```bash
npm run stats
```
Displays all processed applications, ATS match scores, submission statuses, and exports `output/job_leads.csv` for Excel/Google Sheets.

---

## 📂 Output Folder Structure

```
project-jobfinder/
├── output/
│   ├── resumes/            # Tailored PDF resumes (e.g. Abdurrahman_Hassan_Acquisity.pdf)
│   ├── drafts/             # Personalized cold emails and cover letters
│   ├── screenshots/        # Full-page screenshots of filled ATS application forms
│   ├── database.json       # Local JSON database tracking all applications & statuses
│   └── job_leads.csv       # Exported spreadsheet for Excel & Google Sheets
├── src/
│   ├── automation/         # ATS Form Submitter & AI Question Answering Engine
│   ├── ai/                 # ATS Match Scoring & Resume Tailoring Engine
│   ├── discovery/          # Cascading Search Discovery (Bing -> DDG -> Google)
│   ├── scraper/            # Career Page & Job Description Scraper
│   ├── enrichment/         # Apollo.io & DNS MX Email Resolution
│   ├── mailer/             # Gmail Sender with DNS MX Guard
│   ├── tracker/            # Local CRM Lead Storage
│   └── cli.ts              # Command Line Interface
```

---

## 🛡️ Safety, Deliverability & Compliance

1. **DNS MX Deliverability Guard:** Every recipient domain is checked against active DNS mail exchanger records before sending.
2. **Duplicate Target Filter:** Checks `database.json` by company domain and job URL to ensure you never apply twice to the same opening.
3. **Dry-Run Safety Mode:** All commands default to safe preview modes unless `--submit` is explicitly passed.
4. **Stealth Headless Chromium:** Includes anti-fingerprinting patches, random user agents, and SSL certificate error recovery.

---

## 📄 License
MIT License © 2026 Abdurrahman Hassan
