export function extractEmailsFromHtml(html: string): string[] {
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
  const matches = html.match(emailRegex) || [];

  const invalidPatterns = [
    /\.png$/i,
    /\.jpg$/i,
    /\.jpeg$/i,
    /\.gif$/i,
    /\.svg$/i,
    /\.webp$/i,
    /@example\.com$/i,
    /@domain\.com$/i,
    /@email\.com$/i,
    /@sentry\.io$/i,
    /@w3\.org$/i,
    /@github\.com$/i,
    /@cloudflare\.com$/i,
    /@\d+\.\d+/i, // e.g. @5.3.3
    /^bootstrap@/i,
    /^fontawesome@/i,
    /^jquery@/i,
    /^npm@/i
  ];

  const unique = new Set<string>();

  for (const match of matches) {
    const clean = match.toLowerCase().replace(/^mailto:/i, '').trim();
    const domainPart = clean.split('@')[1] || '';
    const hasValidTld = /\.[a-z]{2,}$/i.test(domainPart);

    if (
      clean.length > 5 &&
      clean.length < 60 &&
      hasValidTld &&
      !invalidPatterns.some((pattern) => pattern.test(clean))
    ) {
      unique.add(clean);
    }
  }

  // Sort by relevance (jobs, careers, hr, hiring, recruit, talent first)
  const prioritized = Array.from(unique).sort((a, b) => {
    const isPriority = (email: string) =>
      /hiring|talent|career|jobs|recruiting|hr|team|founder/i.test(email) ? 1 : 0;
    return isPriority(b) - isPriority(a);
  });

  return prioritized;
}
