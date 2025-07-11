const puppeteer = require('puppeteer');
const fs = require('fs');

let paused = false;
let pausePromise = null;
let pauseResolve = null;

function checkPaused() {
  if (!paused) return Promise.resolve();
  if (!pausePromise) {
    pausePromise = new Promise(resolve => { pauseResolve = resolve; });
  }
  return pausePromise;
}

async function runUnscroll({ username, password, config }) {
  process.send && process.send('Received unscroll config: ' + JSON.stringify(config));
  const browser = await puppeteer.launch({ headless: false, ignoreHTTPSErrors: true });
  const page = await browser.newPage();
  process.send && process.send('Browser launched for unscroll');

  // Load collectibles (if needed)
  let collectibles = [];
  try {
    const text = fs.readFileSync('./collectibles.txt', 'utf-8');
    collectibles = text.split('\n');
    process.send && process.send('Collectibles loaded for unscroll');
  } catch (e) {
    process.send && process.send('Could not load collectibles.txt for unscroll');
  }

  // Helper functions
  async function navigateTo(url) {
    await checkPaused();
    await page.goto(url, { waitUntil: 'networkidle2' });
    process.send && process.send('Navigated to ' + url);
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  async function waitForElement(selector, timeout = 200) {
    await checkPaused();
    await page.waitForSelector(selector, { timeout });
    process.send && process.send('waitForElement: ' + selector);
  }

  async function clickElement(selector, { waitForNav = false } = {}) {
    await checkPaused();
    if (waitForNav) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click(selector)
      ]);
      process.send && process.send('clickElement (with navigation): ' + selector);
    } else {
      await page.click(selector);
      process.send && process.send('clickElement: ' + selector);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  async function getTextContent(selector) {
    const el = await page.$(selector);
    if (!el) return '';
    const text = await page.evaluate(el => el.textContent, el);
    process.send && process.send('getTextContent: ' + selector + ' => ' + text);
    return text;
  }

  // Login
  await navigateTo('https://blackdragon.mobi/');
  await waitForElement('input[name=username]');
  await page.type('input[name=username]', username);
  await waitForElement('input[name=password]');
  await page.type('input[name=password]', password);
  await waitForElement('.button');
  await clickElement('.button', { waitForNav: true });
  process.send && process.send('Logged in for unscroll');

  // Navigate to unscroll page
  await waitForElement("body > div.list.center.small > a:nth-child(6)");
  await clickElement("body > div.list.center.small > a:nth-child(6)", { waitForNav: true });

  await waitForElement("body > div.main > div.block > table > tbody > tr:nth-child(27) > td:nth-child(2) > a");
  await clickElement("body > div.main > div.block > table > tbody > tr:nth-child(27) > td:nth-child(2) > a", { waitForNav: true });

  // Main unscroll loop
  do {
    await checkPaused();
    await waitForElement("body > div.main > div.block > form > p > input");
    await clickElement("body > div.main > div.block > form > p > input", { waitForNav: true });

    await waitForElement("body > div.main > div.block > form > p > input.button");
    await clickElement("body > div.main > div.block > form > p > input.button", { waitForNav: true });

    await waitForElement("body > div.main > div.nav > a:nth-child(1)");
    await clickElement("body > div.main > div.nav > a:nth-child(1)", { waitForNav: true });
  } while (true);

  // Clean up on stop
  process.on('SIGTERM', async () => {
    process.send && process.send('🛑 Unscroll stopped by user');
    await browser.close();
    process.exit(0);
  });
}

// Listen for pause/resume messages
process.on('message', (msg) => {
  if (msg && msg.type === 'pause') {
    paused = true;
    process.send && process.send('⏸️ Unscroll paused by user');
  } else if (msg && msg.type === 'resume') {
    paused = false;
    if (pauseResolve) pauseResolve();
    pausePromise = null;
    pauseResolve = null;
    process.send && process.send('▶️ Unscroll resumed by user');
  }
});

// Only start unscroll if the message contains username and password (initial run)
process.on('message', async (data) => {
  if (data && data.username && data.password) {
    try {
      await runUnscroll(data);
      process.exit(0);
    } catch (err) {
      process.send && process.send('Error: ' + err.message);
      process.exit(1);
    }
  }
});