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

async function runAutomation({ username, password, config }) {
  process.send && process.send('Received config: ' + JSON.stringify(config));
  const browser = await puppeteer.launch({ headless: false, ignoreHTTPSErrors: true });
  const page = await browser.newPage();
  process.send && process.send('Browser launched');

  // Load collectibles (if needed)
  let collectibles = [];
  try {
    const text = fs.readFileSync('./collectibles.txt', 'utf-8');
    collectibles = text.split('\n');
    process.send && process.send('Collectibles loaded');
  } catch (e) {
    process.send && process.send('Could not load collectibles.txt');
  }

  // Helper functions mimicking index.js
  async function navigateTo(url) {
    await checkPaused();
    await page.goto(url, { waitUntil: 'networkidle2' });
    process.send && process.send('Navigated to ' + url);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async function waitForElement(selector, timeout = 100) {
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
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async function getTextContent(selector) {
    const el = await page.$(selector);
    if (!el) return '';
    const text = await page.evaluate(el => el.textContent, el);
    process.send && process.send('getTextContent: ' + selector + ' => ' + text);
    return text;
  }

  // Helper function to wait for XPath
  async function waitForXPath(xpath, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const elements = await page.$x(xpath);
      if (elements.length > 0) return elements[0];
      await new Promise(res => setTimeout(res, 200));
    }
    throw new Error('XPath not found: ' + xpath);
  }

  // Login
  await navigateTo('https://blackdragon.mobi/');
  await waitForElement('input[name=username]');
  await page.type('input[name=username]', username);
  await waitForElement('input[name=password]');
  await page.type('input[name=password]', password);
  await waitForElement('.button');
  await clickElement('.button', { waitForNav: true });
  process.send && process.send('Logged in');

  // Main automation logic
  async function nextAttack() {
    process.send && process.send('⚔️ Processing battle result...');
    try {
      await waitForElement('body > div.main > strong',100);
      const text = await getTextContent('body > div.main > strong');
      if ((text && text.includes('Congratulations! You won the battle!')) || (text && text.includes('You lost the battle.'))) {
        process.send && process.send('🔄 Battle ended, continuing...');
        await waitForElement('body > div.main > form > input',100);
        await clickElement('body > div.main > form > input', { waitForNav: true });
        await nextAttack();
      } else if (text && text.includes('Congratulations! You KILLED')) {
        process.send && process.send('💀 Monster killed!');
        let nameFull = '';
        let quality = '';
        // Try to get item name
        try {
          await waitForElement('body > div.main > a', 100);
          nameFull = await getTextContent('body > div.main > a');
          process.send && process.send(nameFull);
        } catch (error) {
          process.send && process.send('No loot link found');
        }
        // Try to get item quality
        if(config.epicGear){try {
          await waitForElement('body > div.main > span:nth-child(16)', 100);
          quality = await getTextContent('body > div.main > span:nth-child(16)');
        } catch (error) {
          try {
            await waitForElement('body > div.main > span:nth-child(18)', 100);
            quality = await getTextContent('body > div.main > span:nth-child(18)');
          } catch {
          // Do nothing
          }
        }}

        if (config.all
          || (config.pieceGear && nameFull.toLocaleLowerCase().includes("a piece of"))
          || (config.recipe && nameFull.toLocaleLowerCase().includes("recipe"))
          || (config.charm && nameFull.toLocaleLowerCase().includes("charm"))
          || (config.jewel && (nameFull.toLocaleLowerCase().includes("jewel")||nameFull.toLocaleLowerCase().includes("elixir")))
          || (config.rune && (nameFull.toLocaleLowerCase().includes("rune ")||nameFull.toLocaleLowerCase().includes("level ")))
          || (config.epicGear && (nameFull.toLocaleLowerCase().includes("(iv)")||nameFull.toLocaleLowerCase().includes("(v)")||quality.toLocaleLowerCase().includes("epic")||quality.toLocaleLowerCase().includes("mythic")||quality.toLocaleLowerCase().includes("heroic")))
          || (config.magicScroll && nameFull.toLocaleLowerCase().includes("magic scroll"))
          || (config.monsterScroll && nameFull.toLocaleLowerCase().includes("s magic scroll"))
          || (config.staminaPotion && nameFull.toLocaleLowerCase().includes("stamina potion"))
          || (config.ancientPotion && nameFull.toLocaleLowerCase().includes("ancient potion"))
        ) {
            process.send && process.send('💎 Valuable loot found!');
            await waitForElement('body > div.main > form:nth-child(3) > input',100);
            await clickElement("body > div.main > form:nth-child(3) > input", { waitForNav: true });
            await choosing();
        } else {
          try {
            const xpath = '/html/body/div[4]/form[2]/input';
            await page.waitForSelector('xpath//' + xpath, { timeout: 10000 });
            const [element] = await page.$$('xpath//' + xpath);
            if (!element) throw new Error('Element not found');
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle2' }),
              element.click()
            ]);

            await choosing();

          } catch (e) {
            process.send && process.send('Error with XPath! ' + e);
            // Optionally handle the case where the XPath is not found
          }
        }
      }
    } catch (error) {
      process.send && process.send('❌ Error in nextAttack: ' + error.message);
    }
  }

  async function firstAttack() {
    process.send && process.send('⚔️ Starting first attack...');
    try {
      await waitForElement('body > div.main > form > input', 100);
      await clickElement('body > div.main > form > input', { waitForNav: true });
      await nextAttack();
    } catch {
      try {
        await waitForElement('body > div.main > div.list.small > form > input', 100);
        await clickElement('body > div.main > div.list.small > form > input', { waitForNav: true });
        await firstAttack();
      } catch {
        await nextAttack();
      }
    }
  }

  async function choosing() {
    process.send && process.send('🎯 Selecting target...');
    await waitForElement('.unit.round',100);
    await clickElement('.unit.round', { waitForNav: true });
    await firstAttack();
  }

  // Start automation
  process.send && process.send('🚀 Starting automation...');
  process.send && process.send('🗺️ Navigating to maps page...');
  await navigateTo('https://blackdragon.mobi/maps/view');
  process.send && process.send('✅ Arrived at maps page, starting target selection...');
  await choosing();

  // Clean up on stop
  process.on('SIGTERM', async () => {
    process.send && process.send('🛑 Automation stopped by user');
    await browser.close();
    process.exit(0);
  });
}

process.on('message', (msg) => {
  if (msg && msg.type === 'pause') {
    paused = true;
    process.send && process.send('⏸️ Paused by user');
  } else if (msg && msg.type === 'resume') {
    paused = false;
    if (pauseResolve) pauseResolve();
    pausePromise = null;
    pauseResolve = null;
    process.send && process.send('▶️ Resumed by user');
  }
});

// Only start automation if the message contains username and password (initial run)
process.on('message', async (data) => {
  if (data && data.username && data.password) {
    try {
      await runAutomation(data);
      process.exit(0);
    } catch (err) {
      process.send && process.send('Error: ' + err.message);
      process.exit(1);
    }
  }
});