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

async function ensureUserStatsColumns(db) {
  try {
    await dbRun(db, 'ALTER TABLE users ADD COLUMN inventory_count INTEGER');
  } catch {}
  try {
    await dbRun(db, 'ALTER TABLE users ADD COLUMN inventory_capacity INTEGER');
  } catch {}
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

async function runFetchUserStats({ username }) {
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

  // Step 1: Navigate to items index.
  await helpers.navigateTo('/items/index');
  process.send && process.send('📦 Opened items index for user stats.');

  // Step 2: Capture inventory count/capacity from "Inventory (98/100):".
  const inventory = await page.evaluate(() => {
    const text = document.body?.innerText || '';
    const match = text.match(/Inventory\s*\((\d+)\s*\/\s*(\d+)\)\s*:/i);
    if (!match) return null;
    return { count: Number(match[1]), capacity: Number(match[2]) };
  });

  if (inventory) {
    const db = new sqlite3.Database(DB_PATH);
    try {
      await ensureUserStatsColumns(db);
      await dbRun(
        db,
        'UPDATE users SET inventory_count = ?, inventory_capacity = ? WHERE username = ?',
        [inventory.count, inventory.capacity, username]
      );
      process.send && process.send(`📊 Inventory saved: ${inventory.count}/${inventory.capacity}`);
    } finally {
      db.close();
    }
  } else {
    process.send && process.send('⚠️ Inventory text not found.');
  }

  process.on('SIGTERM', async () => {
    for (const [accountName, instance] of runningChromeInstances) {
      instance.process.kill();
      runningChromeInstances.delete(accountName);
    }
    process.exit(0);
  });
}

process.on('message', async (data) => {
  if (data && data.username) {
    try {
      await runFetchUserStats(data);
      process.exit(0);
    } catch (err) {
      process.send && process.send('Error: ' + err.message);
      process.exit(1);
    }
  }
});
