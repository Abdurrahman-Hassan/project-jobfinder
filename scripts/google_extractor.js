/**
 * JobFinder Pro - Google Search DevTools Console Extractor
 * 
 * Instructions:
 * 1. Open Google.com in your normal Chrome/Brave browser and run your search query
 *    (e.g., "Next.js software agencies in Europe" or "site:lever.co Next.js engineer")
 * 2. Press F12 (or right-click -> Inspect) and open the "Console" tab.
 * 3. Paste this script and press Enter.
 * 4. It will copy all organic company URLs to your clipboard and download "google_leads.txt".
 * 5. Then run: npm run bulk output/google_leads.txt
 */

(() => {
  const IGNORED = [
    'google.com', 'youtube.com', 'facebook.com', 'twitter.com', 'x.com',
    'linkedin.com', 'instagram.com', 'reddit.com', 'wikipedia.org',
    'quora.com', 'glassdoor.com', 'indeed.com'
  ];

  const results = [];
  const seenUrls = new Set();

  document.querySelectorAll('a').forEach((a) => {
    const href = a.href;
    const h3 = a.querySelector('h3') || a.parentElement?.querySelector('h3');
    const title = h3 ? h3.innerText.trim() : a.innerText.trim();

    if (
      href &&
      href.startsWith('http') &&
      !seenUrls.has(href) &&
      !IGNORED.some((dom) => href.includes(dom)) &&
      title.length > 3
    ) {
      seenUrls.add(href);
      results.push({ title, url: href });
    }
  });

  if (results.length === 0) {
    console.warn('⚠️ No organic search results found. Make sure you are on a Google search results page!');
    return;
  }

  console.log(`%c✓ Extracted ${results.length} Google Search Targets:`, 'color: green; font-size: 16px; font-weight: bold;');
  console.table(results);

  // 1. Copy URLs to clipboard
  const urlList = results.map((r) => r.url).join('\n');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(urlList);
    console.log('%c📋 Copied all target URLs to your clipboard!', 'color: #00bcd4; font-weight: bold;');
  }

  // 2. Download file
  const blob = new Blob([urlList], { type: 'text/plain' });
  const downloadLink = document.createElement('a');
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = 'google_leads.txt';
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);

  console.log('%c📁 Downloaded "google_leads.txt"! Save it to project-jobfinder/output/ and run:\n\n  npm run bulk output/google_leads.txt\n', 'color: #4caf50; font-weight: bold;');
})();
