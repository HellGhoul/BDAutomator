const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const BlackDragonHelpers = require('./blackdragon-helpers');

let helpers = null;
let runningChromeInstances = new Map();
const DB_PATH = path.join(__dirname, 'AutomatorDatabase.sqlite');
let shouldStop = false;

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
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

async function runListItems({ username }) {
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
  helpers = new BlackDragonHelpers(page);

  // Step 1: Open the map change page.
  await helpers.navigateTo('/maps/change');
  process.send && process.send('🧭 Opened map change page.');

  // Step 2: Load keeper locations from DB (key_pair).
  const db = new sqlite3.Database(DB_PATH);
  try {
    await dbRun(
      db,
      `CREATE TABLE IF NOT EXISTS keeper_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        location TEXT NOT NULL,
        keeper TEXT NOT NULL,
        page_number INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        itemid TEXT NOT NULL,
        quantity INTEGER NOT NULL
      )`
    );
    const rows = await dbAll(
      db,
      'SELECT key, value FROM key_pair WHERE type = ? ORDER BY id',
      ['keeper_location']
    );

    for (const row of rows) {
      if (shouldStop) break;
      const selector = `a[href*="${row.key}"]`;
      try {
        // Step 2.1: Wait for teleport entries matching the keeper key.
        await helpers.waitForElement(selector, 5000);
        let index = 0;
        while (true) {
          if (shouldStop) break;
          const elements = await page.$$(selector);
          if (!elements[index]) break;

          // Step 2.2: Click the teleport entry to enter the keeper map.
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
            elements[index].click()
          ]);
          process.send && process.send(`📍 Teleported to ${row.key}`);

          // Step 3: Click the map target image using the keeper value.
          await helpers.clickElement(`a img[src*="${row.value}"]`, { waitForNav: true });

          // Step 4: Click the "Get Items" input button with class="button".
          const getItemsButton = await page.$('input.button[value="Get Items"], input.button[value="Get items"]');
          if (getItemsButton) {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
              getItemsButton.click()
            ]);
          } else {
            process.send && process.send('⚠️ "Get Items" input.button not found');
          }

          // Step 5: Read pagination text like "Page: 3/5" to find max page.
          const maxPage = await page.evaluate(() => {
            const text = document.body?.innerText || '';
            const match = text.match(/Page:\s*\d+\s*\/\s*(\d+)/i);
            return match ? Number(match[1]) : 1;
          });

          // Step 5.1: Loop all pages and visit each page URL.
          const baseUrl = page.url();
          const collectedItems = [];
          for (let currentPage = 1; currentPage <= maxPage; currentPage += 1) {
            await helpers.navigateTo(`${baseUrl}/page=${currentPage}`);

            // Step 5.3: Collect items from the second ".list" container on the page.
            const pageItems = await page.evaluate(() => {
              const lists = document.querySelectorAll('.list');
              if (lists.length < 2) return [];
              const container = lists[1];
              const anchors = Array.from(container.querySelectorAll('a'));
              return anchors.map(anchor => {
                const name = (anchor.textContent || '').trim();
                const href = anchor.getAttribute('href') || '';
                let itemid = '';
                try {
                  const url = new URL(href, window.location.origin);
                  itemid = url.searchParams.get('id') || '';
                } catch {
                  const match = href.match(/id=([^&]+)/);
                  itemid = match ? match[1] : '';
                }
                return {
                  item_name: name,
                  itemid
                };
              }).filter(item => item.item_name || item.itemid);
            });

            pageItems.forEach(item => {
              collectedItems.push({
                page_number: currentPage,
                item_name: item.item_name,
                itemid: item.itemid,
                quantity: 1
              });
            });
          }

          // Step 5.4: Replace existing items for this user/location with newly collected data.
          await dbRun(
            db,
            'DELETE FROM keeper_items WHERE username = ? AND location = ? AND keeper = ?',
            [username, row.key, row.value]
          );
          const stmt = db.prepare(
            `INSERT INTO keeper_items
             (username, location, keeper, page_number, item_name, itemid, quantity)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          );
          for (const item of collectedItems) {
            stmt.run([
              username,
              row.key,
              row.value,
              item.page_number,
              item.item_name || '',
              item.itemid || '',
              item.quantity
            ]);
          }
          stmt.finalize();

          // Step 6: Wait 3 seconds before continuing.
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Step 7: Return to map change page before the next entry.
          await helpers.navigateTo('/maps/change');
          index += 1;
        }
      } catch (error) {
        process.send && process.send(`⚠️ Teleport failed for ${row.key}: ${error.message}`);
      }
    }
  } finally {
    db.close();
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
      await runListItems(data);
      process.exit(0);
    } catch (err) {
      process.send && process.send('Error: ' + err.message);
      process.exit(1);
    }
  } else if (data && data.type === 'stop') {
    shouldStop = true;
  }
});
