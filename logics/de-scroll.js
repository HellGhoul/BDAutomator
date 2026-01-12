const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const BlackDragonHelpers = require('../blackdragon-helpers');

let runningChromeInstances = new Map();

function getPortForAccount(accountName) {
  const basePort = 9222;
  const hash = simpleHash(accountName);
  return basePort + (hash % 1000) + 1;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function getChromePath() {
  const platform = os.platform();
  if (platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else if (platform === 'win32') {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }
  return '/usr/bin/google-chrome';
}

function getUserDataDir(accountName) {
  const baseDir = path.join(process.cwd(), 'chrome-profiles');
  const accountDir = path.join(baseDir, accountName.replace(/[^a-zA-Z0-9]/g, '_'));
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  if (!fs.existsSync(accountDir)) {
    fs.mkdirSync(accountDir, { recursive: true });
  }
  return accountDir;
}

async function startChromeForAccount(accountName) {
  const port = getPortForAccount(accountName);
  const userDataDir = getUserDataDir(accountName);
  const chromePath = getChromePath();
  const command = `"${chromePath}" --remote-debugging-port=${port} --user-data-dir="${userDataDir}"`;

  return new Promise((resolve, reject) => {
    const child = exec(command, error => {
      if (error) {
        reject(error);
      }
    });
    runningChromeInstances.set(accountName, {
      process: child,
      port,
      userDataDir
    });
    setTimeout(() => resolve({ port, userDataDir, process: child }), 3000);
  });
}

async function clickInputByValue(page, valueText) {
  const handle = await page.evaluateHandle((text) => {
    const inputs = Array.from(document.querySelectorAll('input[type="submit"]'));
    return inputs.find(input => (input.value || '').includes(text)) || null;
  }, valueText);
  const element = handle.asElement();
  if (!element) {
    await handle.dispose();
    return false;
  }
  const nav = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null);
  await element.click();
  await nav;
  await handle.dispose();
  return true;
}

async function clickLinkByText(page, valueText) {
  const handle = await page.evaluateHandle((text) => {
    const links = Array.from(document.querySelectorAll('a'));
    return links.find(link => (link.textContent || '').includes(text)) || null;
  }, valueText);
  const element = handle.asElement();
  if (!element) {
    await handle.dispose();
    return false;
  }
  const nav = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null);
  await element.click();
  await nav;
  await handle.dispose();
  return true;
}

async function runDeScroll({ username }) {
  let browser;
  const port = getPortForAccount(username);

  try {
    browser = await puppeteer.connect({
      browserURL: `http://localhost:${port}`,
      defaultViewport: null
    });
  } catch {
    await startChromeForAccount(username);
    await new Promise(resolve => setTimeout(resolve, 2000));
    browser = await puppeteer.connect({
      browserURL: `http://localhost:${port}`,
      defaultViewport: null
    });
  }

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  const helpers = new BlackDragonHelpers(page);

  let loops = 0;
  while (true) {
    await helpers.navigateTo('https://blackdragon.mobi/credits/use/id=unscroll');
    const hasRefresh = await clickInputByValue(page, 'Refresh');
    if (!hasRefresh) {
      process.send && process.send('✅ De-scroll complete. Refresh button not found.');
      break;
    }
    const continued = await clickInputByValue(page, 'Continue');
    if (!continued) {
      process.send && process.send('⚠️ De-scroll stopped. Continue button not found.');
      break;
    }
    const confirmed = await clickInputByValue(page, 'Confirm');
    if (!confirmed) {
      process.send && process.send('⚠️ De-scroll stopped. Confirm button not found.');
      break;
    }
    const wentBack = await clickLinkByText(page, 'Back');
    if (!wentBack) {
      process.send && process.send('⚠️ De-scroll stopped. Back link not found.');
      break;
    }
    loops += 1;
    process.send && process.send(`🔁 De-scroll cycle complete (${loops}).`);
  }

  try {
    if (browser) {
      await browser.disconnect();
    }
  } catch {
    // Ignore disconnect errors.
  }
}

process.on('message', async (data) => {
  if (data && data.username) {
    try {
      await runDeScroll(data);
      process.exit(0);
    } catch (err) {
      process.send && process.send('Error: ' + err.message);
      process.exit(1);
    }
  }
});
