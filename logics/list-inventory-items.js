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

function finalizeStmt(stmt) {
  return new Promise((resolve, reject) => {
    stmt.finalize(err => {
      if (err) reject(err);
      else resolve();
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

async function runListInventory({ username }) {
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

  await helpers.navigateTo('https://blackdragon.mobi/items/index');
  process.send && process.send('🎒 Opened inventory page.');

  let inventoryItems = [];
  try {
    await helpers.waitForElement('.block', 5000);
    inventoryItems = await page.evaluate(() => {
      const blocks = Array.from(document.querySelectorAll('.block'));
      const items = [];

      blocks.forEach(block => {
        let currentQty = 1;
        let hasQty = false;

        block.childNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          const tag = node.tagName;

          if (tag === 'STRONG') {
            const text = (node.textContent || '').trim();
            const parsed = Number(text.replace(/,/g, ''));
            if (!Number.isNaN(parsed) && parsed > 0) {
              currentQty = parsed;
              hasQty = true;
            }
            return;
          }

          if (tag === 'A') {
            const href = node.getAttribute('href') || '';
            if (!href.includes('/items/view/')) return;

            const name = (node.textContent || '').trim();
            const match = href.match(/id=([\d]+)/);
            const itemid = match ? match[1] : '';
            const quantity = hasQty ? currentQty : 1;

            if (name || itemid) {
              items.push({
                item_name: name,
                itemid,
                quantity
              });
            }

            hasQty = false;
            currentQty = 1;
            return;
          }

          if (tag === 'BR') {
            hasQty = false;
            currentQty = 1;
          }
        });
      });

      return items;
    });
  } catch (error) {
    process.send && process.send(`⚠️ Inventory parse failed: ${error.message}`);
    inventoryItems = [];
  }

  process.send && process.send(`📦 Inventory items found: ${inventoryItems.length}`);

  const db = new sqlite3.Database(DB_PATH);
  try {
    await dbRun(
      db,
      'DELETE FROM keeper_items WHERE username = ? AND location = ?',
      [username, 'inventory']
    );

    const inventoryStmt = db.prepare(
      `INSERT INTO keeper_items
       (username, location, keeper, page_number, item_name, itemid, quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    inventoryItems.forEach(item => {
      inventoryStmt.run([
        username,
        'inventory',
        'inventory',
        1,
        item.item_name || '',
        item.itemid || '',
        item.quantity || 1
      ]);
    });
    await finalizeStmt(inventoryStmt);
    process.send && process.send({ type: 'list-inventory-complete', username });
  } finally {
    db.close();
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
      await runListInventory(data);
      process.exit(0);
    } catch (err) {
      process.send && process.send('Error: ' + err.message);
      process.exit(1);
    }
  }
});
