import dns from 'dns/promises';

/**
 * Decodes Cloudflare email obfuscation (data-cfemail="hex...")
 */
export function decodeCloudflareEmail(encoded: string): string {
  try {
    let email = '';
    const r = parseInt(encoded.substring(0, 2), 16);
    for (let n = 2; n < encoded.length; n += 2) {
      const c = parseInt(encoded.substring(n, n + 2), 16) ^ r;
      email += String.fromCharCode(c);
    }
    return email.trim().toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Extracts emails from HTML, decoding mailto links, Cloudflare obfuscation,
 * and anti-spam patterns (e.g. name [at] domain.com).
 */
export function extractEmailsFromHtml(html: string): string[] {
  if (!html) return [];

  const unique = new Set<string>();

  // 1. Cloudflare Decoded Emails
  const cfMatches = html.matchAll(/data-cfemail=["']([a-f0-9]+)["']/gi);
  for (const match of cfMatches) {
    const decoded = decodeCloudflareEmail(match[1]);
    if (decoded && decoded.includes('@')) {
      unique.add(decoded);
    }
  }

  // 2. Standard regex emails & mailto links
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
  const matches = html.match(emailRegex) || [];
  for (const m of matches) {
    unique.add(m.toLowerCase().replace(/^mailto:/i, '').trim());
  }

  // 3. Obfuscated emails: user [at] domain [dot] com
  const obfuscatedRegex =
    /([a-zA-Z0-9._-]+)\s*(?:\[at\]|\(at\)|\sat\s)\s*([a-zA-Z0-9_-]+)\s*(?:\[dot\]|\(dot\)|\.|\sdot\s)\s*([a-zA-Z]{2,10})/gi;
  const obfMatches = html.matchAll(obfuscatedRegex);
  for (const match of obfMatches) {
    const candidate = `${match[1]}@${match[2]}.${match[3]}`.toLowerCase().trim();
    unique.add(candidate);
  }

  const invalidPatterns = [
    /\.(png|jpg|jpeg|gif|svg|webp|ico|css|js)$/i,
    /@example\.com$/i,
    /@domain\.com$/i,
    /@email\.com$/i,
    /@company\.com$/i,
    /@mycompany\.com$/i,
    /@sentry\.io$/i,
    /@w3\.org$/i,
    /@github\.com$/i,
    /@cloudflare\.com$/i,
    /@\d+\.\d+/i,
    /^bootstrap@/i,
    /^fontawesome@/i,
    /^jquery@/i,
    /^npm@/i,
    /^you@/i,
    /^user@/i,
    /^name@/i,
    /^test@/i,
    /^sample@/i
  ];

  const validEmails: string[] = [];

  for (const email of unique) {
    const domainPart = email.split('@')[1] || '';
    const hasValidTld = /\.[a-z]{2,}$/i.test(domainPart);

    if (
      email.length > 5 &&
      email.length < 65 &&
      hasValidTld &&
      !invalidPatterns.some((pattern) => pattern.test(email))
    ) {
      validEmails.push(email);
    }
  }

  // Sort by priority (direct hiring, tech, founder, hello, contact)
  return validEmails.sort((a, b) => {
    const getPriority = (em: string) => {
      if (/hiring|talent|career|jobs|recruiting|hr/i.test(em)) return 5;
      if (/founder|ceo|cto|engineering|tech|team/i.test(em)) return 4;
      if (/hello|hi|contact|info/i.test(em)) return 3;
      return 1;
    };
    return getPriority(b) - getPriority(a);
  });
}

/**
 * Checks DNS MX records to verify domain accepts incoming emails.
 */
export async function verifyDomainHasMx(domain: string): Promise<boolean> {
  if (!domain) return false;
  const cleanDomain = domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split(':')[0]
    .trim();

  if (!cleanDomain || cleanDomain.includes('localhost')) return false;

  try {
    const mxRecords = await dns.resolveMx(cleanDomain);
    return Array.isArray(mxRecords) && mxRecords.length > 0;
  } catch {
    return false;
  }
}
