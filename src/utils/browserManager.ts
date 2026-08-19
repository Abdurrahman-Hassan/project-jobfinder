import fs from 'fs/promises';
import path from 'path';
import puppeteer, { Browser } from 'puppeteer';

const activeBrowsers = new Set<Browser>();

// Handle graceful process shutdown to avoid orphaned browser processes
function setupCleanupHooks() {
  const cleanup = async () => {
    for (const browser of activeBrowsers) {
      try {
        if (browser.isConnected()) {
          await browser.close();
        }
      } catch {
        // ignore errors on exit
      }
    }
    activeBrowsers.clear();
  };

  process.once('SIGINT', async () => {
    await cleanup();
    process.exit(130);
  });

  process.once('SIGTERM', async () => {
    await cleanup();
    process.exit(143);
  });

  process.once('exit', () => {
    for (const browser of activeBrowsers) {
      try {
        browser.process()?.kill('SIGKILL');
      } catch {
        // ignore
      }
    }
  });
}

setupCleanupHooks();

// Browser Executable Detection Matrix (Windows, macOS, Linux)
export interface BrowserCandidate {
  name: string;
  type: 'chrome' | 'edge' | 'brave' | 'chromium' | 'vivaldi';
  paths: string[];
}

const BROWSER_DEFINITIONS: BrowserCandidate[] = [
  {
    name: 'Google Chrome',
    type: 'chrome',
    paths: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ]
  },
  {
    name: 'Microsoft Edge',
    type: 'edge',
    paths: [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ]
  },
  {
    name: 'Brave Browser',
    type: 'brave',
    paths: [
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
      '/usr/bin/brave-browser',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    ]
  },
  {
    name: 'Chromium',
    type: 'chromium',
    paths: [
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      'C:\\Program Files\\Chromium\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Chromium\\Application\\chrome.exe')
    ]
  }
];

export async function listAvailableBrowsers(): Promise<{ name: string; type: string; path: string }[]> {
  const available: { name: string; type: string; path: string }[] = [];

  for (const b of BROWSER_DEFINITIONS) {
    for (const p of b.paths) {
      if (!p) continue;
      try {
        await fs.access(p);
        available.push({ name: b.name, type: b.type, path: p });
        break;
      } catch {
        // file doesn't exist
      }
    }
  }

  return available;
}

export async function getBrowserExecutable(preferredType?: string): Promise<string | undefined> {
  // 1. Custom Explicit Path from .env (e.g. BROWSER_PATH=C:\path\to\browser.exe)
  const customPath = process.env.BROWSER_PATH?.trim();
  if (customPath) {
    try {
      await fs.access(customPath);
      return customPath;
    } catch {
      console.warn(`[Browser Warning] Configured BROWSER_PATH does not exist: "${customPath}"`);
    }
  }

  // 2. Preferred Browser Type from option or .env (e.g. BROWSER_TYPE=edge or BROWSER_TYPE=chrome)
  const targetType = (preferredType || process.env.BROWSER_TYPE || '').toLowerCase().trim();

  if (targetType) {
    const candidate = BROWSER_DEFINITIONS.find(
      (b) => b.type === targetType || b.name.toLowerCase().includes(targetType)
    );
    if (candidate) {
      for (const p of candidate.paths) {
        if (!p) continue;
        try {
          await fs.access(p);
          return p;
        } catch {
          // try next path
        }
      }
    }
  }

  // 3. Auto-Discovery Priority: Chrome -> Edge -> Brave -> Chromium
  for (const b of BROWSER_DEFINITIONS) {
    for (const p of b.paths) {
      if (!p) continue;
      try {
        await fs.access(p);
        return p;
      } catch {
        // try next
      }
    }
  }

  return undefined;
}

export async function launchManagedBrowser(
  options: Parameters<typeof puppeteer.launch>[0] & { browserType?: string } = {}
): Promise<Browser> {
  const executablePath = options.executablePath || (await getBrowserExecutable(options.browserType));

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ],
    ...options
  });

  activeBrowsers.add(browser);

  browser.once('disconnected', () => {
    activeBrowsers.delete(browser);
  });

  return browser;
}
