const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const BlackDragonHelpers = require('../blackdragon-helpers');

let runningChromeInstances = new Map();
const DB_PATH = path.join(__dirname, '..', 'AutomatorDatabase.sqlite');

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

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

async function runAutoGetItem({ username, location, keeper, itemid }) {
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

  // Step 1: Go to map change page.
  await helpers.navigateTo('/maps/view');
          
  await helpers.clickElement(`a img[src*="empty.png"]`, { waitForNav: true });
  await helpers.navigateTo('/maps/change');

  // Step 2: Click the teleport entry for this location.
  try {
    await helpers.clickElement(`a[href*="${location}"]`, { waitForNav: true });
  } catch (error) {
    await helpers.navigateTo('/maps/view');
  }

  // Step 3: Click the keeper image to open storage.
  await helpers.clickElement(`a img[src*="${keeper}"]`, { waitForNav: true });

  // Step 4: Click "Get Items".
  const getItemsButton = await page.$('input.button[value="Get Items"], input.button[value="Get items"]');
  if (getItemsButton) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      getItemsButton.click()
    ]);
  }

  // Step 5: Find the page with the item id and click it.
  const maxPage = await page.evaluate(() => {
    const text = document.body?.innerText || '';
    const match = text.match(/Page:\s*\d+\s*\/\s*(\d+)/i);
    return match ? Number(match[1]) : 1;
  });

  const baseUrl = page.url();
  let found = false;
  for (let currentPage = 1; currentPage <= maxPage; currentPage += 1) {
    await helpers.navigateTo(`${baseUrl}/page=${currentPage}`);
    const link = await page.$(`a[href*="id=${itemid}"]`);
    if (link) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
        link.click()
      ]);
      found = true;
      break;
    }
  }

  if (!found) {
    process.send && process.send(`⚠️ Item not found: ${itemid}`);
    return;
  }

  // Step 6: Update DB to move item to inventory and shift keeper order.
  const db = new sqlite3.Database(DB_PATH);
  try {
    const row = await dbGet(
      db,
      'SELECT order_index FROM keeper_items WHERE username = ? AND location = ? AND keeper = ? AND itemid = ?',
      [username, location, keeper, itemid]
    );
    const orderIndex = row ? Number(row.order_index) : null;
    if (orderIndex) {
      await dbRun(
        db,
        'UPDATE keeper_items SET order_index = order_index - 1 WHERE username = ? AND location = ? AND keeper = ? AND order_index > ?',
        [username, location, keeper, orderIndex]
      );
    }
    await dbRun(
      db,
      'UPDATE keeper_items SET location = ?, keeper = ?, order_index = NULL WHERE username = ? AND location = ? AND keeper = ? AND itemid = ?',
      ['inventory', 'inventory', username, location, keeper, itemid]
    );
    await dbRun(
      db,
      'UPDATE users SET inventory_count = COALESCE(inventory_count, 0) + 1 WHERE username = ?',
      [username]
    );
    process.send && process.send(`✅ Item retrieved: ${itemid}`);
  } finally {
    db.close();
  }
}

process.on('message', async (data) => {
  if (data && data.username && data.location && data.keeper && data.itemid) {
    try {
      await runAutoGetItem(data);
      process.exit(0);
    } catch (err) {
      process.send && process.send('Error: ' + err.message);
      process.exit(1);
    }
  }
});
