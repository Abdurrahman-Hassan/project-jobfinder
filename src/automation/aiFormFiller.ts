import axios from 'axios';
import chalk from 'chalk';
import { Page } from 'puppeteer';
import { CandidateProfile, ProcessedJobLead } from '../types/index.js';

interface FormQuestionContext {
  containerIndex: number;
  questionText: string;
  fieldType: 'radio' | 'select' | 'text' | 'textarea' | 'checkbox';
  radios?: { id: string; name: string; value: string; label: string }[];
  selectId?: string;
  selectOptions?: string[];
  inputId?: string;
  inputName?: string;
  placeholder?: string;
}

/**
 * Intelligent AI Answer Generator for custom screening questions.
 */
export async function generateAIAnswerForQuestion(
  question: string,
  profile: CandidateProfile,
  companyName: string,
  jobTitle: string
): Promise<string> {
  const qLower = question.toLowerCase();

  // 1. Instant High-Confidence Heuristic Resolution for Standard ATS Questions
  if (qLower.includes('salary') || qLower.includes('compensation') || qLower.includes('rate') || qLower.includes('expected pay')) {
    return 'Competitive market rate / $80,000 - $100,000 (Negotiable depending on benefits & equity)';
  }
  if (qLower.includes('notice') || qLower.includes('start date') || qLower.includes('how soon') || qLower.includes('available to start')) {
    return 'Immediately / 1-2 weeks';
  }
  if (qLower.includes('hear about') || qLower.includes('source') || qLower.includes('how did you find')) {
    return 'Company Careers Portal / Online Search';
  }
  if (qLower.includes('english') || qLower.includes('language proficiency')) {
    return 'Fluent / Professional Working Proficiency';
  }
  if (qLower.includes('years of experience') || qLower.includes('how many years')) {
    return '4 years';
  }
  if (qLower.includes('remote') || qLower.includes('time zone') || qLower.includes('timezone')) {
    return 'Yes, fully experienced with asynchronous and remote cross-timezone collaboration.';
  }
  if (qLower.includes('visa') || qLower.includes('sponsorship')) {
    return 'No sponsorship required.';
  }
  if (qLower.includes('authorized') || qLower.includes('eligible to work')) {
    return 'Yes, legally authorized to work.';
  }

  // 2. LLM Generation via OpenRouter (if API key available)
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    try {
      const prompt = `You are filling out a job application for a software engineer.
Candidate: ${profile.name} (${profile.title}), 4 years experience in Next.js, React, Node.js, TypeScript, GCP, AI/MCP.
Company: ${companyName}
Role: ${jobTitle}
Question: "${question}"

Instructions:
- Write a professional, authentic, concise answer in 1-3 natural sentences.
- Speak in first person ("I have architected...", "I am excited to...").
- Do NOT use robotic buzzwords or placeholders. Be direct and concrete.`;

      const res = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3.5-lightning:free',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://github.com/Abdurrahman-Hassan/project-jobfinder',
            'X-Title': 'JobFinder Pro',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      const ans = res.data?.choices?.[0]?.message?.content?.trim();
      if (ans && ans.length > 5) {
        return ans.replace(/^["']|["']$/g, '');
      }
    } catch {}
  }

  // 3. Fallback High-Quality Contextual Template Synthesis
  if (qLower.includes('why') && (qLower.includes('join') || qLower.includes('work') || qLower.includes('company') || qLower.includes('us'))) {
    return `I am excited about ${companyName}'s technical vision and engineering culture. With my background in architecting high-performance Next.js web applications, modern microservices, and AI workflows, I look forward to delivering immediate value to the engineering team.`;
  }

  if (qLower.includes('experience') || qLower.includes('project') || qLower.includes('background') || qLower.includes('qualification')) {
    return `Over the past 4 years, I have architected and deployed enterprise full-stack web platforms and high-throughput microservices using Next.js, TypeScript, and Node.js. My experience modernizing production systems for organizations like Aga Khan University and building multi-panel SaaS architectures directly aligns with this role.`;
  }

  return `With 4 years of hands-on software engineering experience specializing in full-stack architecture, high-performance systems (Next.js, React, TypeScript), and cloud microservices (Node.js, GCP), I am well-equipped to contribute directly to this position.`;
}

/**
 * Scans page DOM, detects custom screening questions, and fills them with AI.
 */
export async function autoFillCustomQuestions(
  page: Page,
  profile: CandidateProfile,
  companyName: string,
  jobTitle: string
): Promise<number> {
  let filledCount = 0;

  try {
    // 1. Extract all question containers from the page
    const questionContainers: FormQuestionContext[] = await page.evaluate(() => {
      const list: FormQuestionContext[] = [];
      const containers = document.querySelectorAll(
        'div[data-ui*="question"], div[class*="styles--3aPac"], .form-group, fieldset, li.custom-question, div[role="group"]'
      );

      containers.forEach((container: any, idx) => {
        const text = container.innerText?.trim() || '';
        if (text.length < 3) return;

        // Skip basic profile fields already handled
        const lower = text.toLowerCase();
        if (
          lower.includes('first name') ||
          lower.includes('last name') ||
          lower.includes('email') ||
          lower.includes('phone') ||
          lower.includes('photo') ||
          lower.includes('avatar') ||
          lower.includes('resume') ||
          lower.includes('cover letter') ||
          lower.includes('headline') ||
          lower.includes('address') ||
          lower.includes('website') ||
          lower.includes('linkedin') ||
          lower.includes('github') ||
          lower.includes('portfolio')
        ) {
          return;
        }

        // Check for Radio Buttons
        const radioEls = Array.from(container.querySelectorAll('input[type="radio"]'));
        if (radioEls.length > 0) {
          const radios = radioEls.map((r: any) => ({
            id: r.id || '',
            name: r.name || '',
            value: r.value || '',
            label: (container.querySelector(`label[for="${r.id}"]`)?.innerText || r.value || '').trim()
          }));
          list.push({
            containerIndex: idx,
            questionText: text,
            fieldType: 'radio',
            radios
          });
          return;
        }

        // Check for Dropdown / Select
        const selectEl = container.querySelector('select');
        if (selectEl) {
          const options = Array.from(selectEl.options).map((o: any) => o.text.trim());
          list.push({
            containerIndex: idx,
            questionText: text,
            fieldType: 'select',
            selectId: selectEl.id || selectEl.name,
            selectOptions: options
          });
          return;
        }

        // Check for Autocomplete Select Input (e.g. Workable dropdown search)
        const autoSelectInput = container.querySelector('input[placeholder*="Select an option"], input[id*="QA_"]');
        if (autoSelectInput) {
          list.push({
            containerIndex: idx,
            questionText: text,
            fieldType: 'text',
            inputId: autoSelectInput.id,
            inputName: autoSelectInput.name,
            placeholder: autoSelectInput.placeholder
          });
          return;
        }

        // Check for Textarea
        const textareaEl = container.querySelector('textarea');
        if (textareaEl && !textareaEl.value) {
          list.push({
            containerIndex: idx,
            questionText: text,
            fieldType: 'textarea',
            inputId: textareaEl.id,
            inputName: textareaEl.name,
            placeholder: textareaEl.placeholder
          });
          return;
        }

        // Check for Text Input
        const textInput = container.querySelector('input[type="text"], input[type="number"], input:not([type])');
        if (textInput && !textInput.value) {
          list.push({
            containerIndex: idx,
            questionText: text,
            fieldType: 'text',
            inputId: textInput.id,
            inputName: textInput.name,
            placeholder: textInput.placeholder
          });
          return;
        }

        // Check for Checkbox (Terms, Agreements)
        const checkboxEl = container.querySelector('input[type="checkbox"]');
        if (checkboxEl && !checkboxEl.checked) {
          list.push({
            containerIndex: idx,
            questionText: text,
            fieldType: 'checkbox',
            inputId: checkboxEl.id,
            inputName: checkboxEl.name
          });
          return;
        }
      });

      return list;
    });

    if (questionContainers.length === 0) {
      return 0;
    }

    console.log(chalk.gray(`  • Analyzing & auto-answering ${questionContainers.length} custom screening questions...`));

    // 2. Process each question intelligently
    for (const q of questionContainers) {
      const qLower = q.questionText.toLowerCase();

      // Handle Radio Questions (Yes / No / Skills / Authorization)
      if (q.fieldType === 'radio' && q.radios && q.radios.length > 0) {
        // Skill / Experience / Qualifications -> Select YES
        // English / Resume -> Select YES
        // Relocation / Remote -> Select YES
        // Sponsorship needed -> Select NO
        // Felonies / Non-compete issues -> Select NO
        let preferYes = true;
        if (
          qLower.includes('require sponsorship') ||
          qLower.includes('need sponsorship') ||
          qLower.includes('criminal') ||
          qLower.includes('felony') ||
          qLower.includes('non-compete') ||
          qLower.includes('disciplinary')
        ) {
          preferYes = false;
        }

        const targetRadio = q.radios.find((r) => {
          const val = (r.label + ' ' + r.value).toLowerCase();
          return preferYes ? (val.includes('yes') || val === 'true') : (val.includes('no') || val === 'false');
        }) || q.radios[0];

        if (targetRadio) {
          const radioInput = await page.$(`input#${targetRadio.id}, input[value="${targetRadio.value}"][name="${targetRadio.name}"]`);
          const radioLabel = await page.$(`label[for="${targetRadio.id}"]`);
          if (radioLabel) {
            await radioLabel.click();
            filledCount++;
          } else if (radioInput) {
            await radioInput.click();
            filledCount++;
          }
        }
      }

      // Handle Select / Dropdown Questions
      else if (q.fieldType === 'select' && q.selectOptions && q.selectOptions.length > 0) {
        const selectElement = await page.$(`select#${q.selectId}, select[name="${q.selectId}"]`);
        if (selectElement) {
          let chosenOption = q.selectOptions[1] || q.selectOptions[0]; // Avoid "Select an option" placeholder
          if (qLower.includes('english')) {
            chosenOption = q.selectOptions.find((o) => /fluent|advanced|native|proficient/i.test(o)) || chosenOption;
          } else if (qLower.includes('experience') || qLower.includes('years')) {
            chosenOption = q.selectOptions.find((o) => /3-5|4|3\+|5/i.test(o)) || chosenOption;
          } else if (qLower.includes('authorized') || qLower.includes('eligible')) {
            chosenOption = q.selectOptions.find((o) => /^yes/i.test(o)) || chosenOption;
          } else if (qLower.includes('sponsorship')) {
            chosenOption = q.selectOptions.find((o) => /^no/i.test(o)) || chosenOption;
          }

          if (chosenOption) {
            await selectElement.select(chosenOption).catch(() => {});
            filledCount++;
          }
        }
      }

      // Handle Text / Textarea Questions (AI Generated Response)
      else if (q.fieldType === 'text' || q.fieldType === 'textarea') {
        const inputEl = await page.$(
          `input#${q.inputId}, textarea#${q.inputId}, input[name="${q.inputName}"], textarea[name="${q.inputName}"]`
        );

        if (inputEl) {
          // Check if it's an autocomplete dropdown (like Workable English level)
          if (qLower.includes('english') && q.placeholder?.includes('Select')) {
            await inputEl.click({ clickCount: 3 });
            await inputEl.type('Fluent', { delay: 30 });
            await page.keyboard.press('Enter');
            await new Promise((r) => setTimeout(r, 500));
            filledCount++;
          } else {
            const aiAnswer = await generateAIAnswerForQuestion(q.questionText, profile, companyName, jobTitle);
            await inputEl.click({ clickCount: 3 });
            await inputEl.type(aiAnswer, { delay: 10 });
            await inputEl.evaluate((el: any) => {
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('input', { bubbles: true }));
            });
            filledCount++;
          }
        }
      }

      // Handle Checkboxes (Agreement / Privacy)
      else if (q.fieldType === 'checkbox' && q.inputId) {
        const checkbox = await page.$(`input#${q.inputId}, input[name="${q.inputName}"]`);
        if (checkbox) {
          const isChecked = await checkbox.evaluate((el: any) => el.checked);
          if (!isChecked) {
            await checkbox.click();
            filledCount++;
          }
        }
      }
    }
  } catch (err: any) {
    console.warn(`[AI Form Filler Note] ${err.message}`);
  }

  return filledCount;
}
