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

async function clickBlacksmithButton(page) {
  const button = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll('input, button, a'));
    return buttons.find(node => (node.textContent || node.value || '')
      .trim()
      .toUpperCase()
      .includes('BLACKSMITH')) || null;
  });
  if (button) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      button.click()
    ]);
  }
}

async function runCraftItem({ username, itemIds }) {
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

  // Step 1: Go to blacksmith.
  await helpers.navigateTo('/items/index/c=65061');
  await clickBlacksmithButton(page);

  // Step 2: Select item ids into item_1/2/3.
  const ids = (itemIds || []).map(id => String(id)).filter(id => id && id !== 'n/a');
  const selectors = ['select[name="item_1"]', 'select[name="item_2"]', 'select[name="item_3"]'];
  for (let i = 0; i < selectors.length; i += 1) {
    const value = ids[i] || '';
    await page.select(selectors[i], value);
  }

  // Step 3: Continue.
  const continueButton = await page.$('input.button[type="submit"][value*="Continue"]');
  if (continueButton) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      continueButton.click()
    ]);
  }

  // Step 4: Confirm crafting.
  const confirmButton = await page.$('input.button[name="submit_title"][type="submit"][value*="Confirm"]');
  if (confirmButton) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      confirmButton.click()
    ]);
  }
}

process.on('message', async (data) => {
  if (data && data.username && Array.isArray(data.itemIds)) {
    try {
      await runCraftItem(data);
      process.exit(0);
    } catch (err) {
      process.send && process.send('Error: ' + err.message);
      process.exit(1);
    }
  }
});
