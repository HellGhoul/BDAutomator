const puppeteer = require('puppeteer');
const fs = require('fs');

async function runAutomation({ username, password }) {
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
    await page.goto(url, { waitUntil: 'networkidle2' });
    process.send && process.send('Navigated to ' + url);
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  async function waitForElement(selector, timeout = 200) {
    await page.waitForSelector(selector, { timeout });
    process.send && process.send('waitForElement: ' + selector);
  }

  async function clickElement(selector, { waitForNav = false } = {}) {
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
  process.send && process.send('Logged in');

  // Main automation logic
  async function nextAttack() {
    process.send && process.send('⚔️ Processing battle result...');
    try {
      await waitForElement('body > div.main > strong',200);
      const text = await getTextContent('body > div.main > strong');
      if ((text && text.includes('Congratulations! You won the battle!')) || (text && text.includes('You lost the battle.'))) {
        process.send && process.send('🔄 Battle ended, continuing...');
        await waitForElement('body > div.main > form > input',200);
        await clickElement('body > div.main > form > input', { waitForNav: true });
        await nextAttack();
      } else if (text && text.includes('Congratulations! You KILLED')) {
        process.send && process.send('💀 Monster killed!');
        let nameFull = '';
        try {
          await waitForElement('body > div.main > a', 100);
          nameFull = await getTextContent('body > div.main > a');
          process.send && process.send(nameFull);
        } catch (error) {
          process.send && process.send('No loot link found');
        }
        if (nameFull.toLowerCase().includes("magic scroll")) {
          process.send && process.send('💎 Valuable loot found!');
          await waitForElement('body > div.main > form:nth-child(3) > input',200);
          await clickElement("body > div.main > form:nth-child(3) > input", { waitForNav: true });
          await choosing();
        } else {
          try {
            await waitForElement("body > div.main > form:nth-child(17) > input", 100);
            await clickElement("body > div.main > form:nth-child(17) > input", { waitForNav: true });
            await choosing();
          } catch {
            try {
              await waitForElement("body > div.main > form:nth-child(15) > input", 100);
              await clickElement("body > div.main > form:nth-child(15) > input", { waitForNav: true });
              await choosing();
            } catch {
              try {
                await waitForElement("body > div.main > form:nth-child(13) > input", 100);
                await clickElement("body > div.main > form:nth-child(13) > input", { waitForNav: true });
                await choosing();
              } catch {
                await waitForElement("body > div.main > form:nth-child(11) > input", 100);
                await clickElement("body > div.main > form:nth-child(11) > input", { waitForNav: true });
                await choosing();
              }
            }
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
      await waitForElement('body > div.main > form > input', 200);
      await clickElement('body > div.main > form > input', { waitForNav: true });
      await nextAttack();
    } catch {
      try {
        await waitForElement('body > div.main > div.list.small > form > input', 200);
        await clickElement('body > div.main > div.list.small > form > input', { waitForNav: true });
        await firstAttack();
      } catch {
        await nextAttack();
      }
    }
  }

  async function choosing() {
    process.send && process.send('🎯 Selecting target...');
    await waitForElement('.unit.round',200);
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

process.on('message', async (data) => {
  try {
    await runAutomation(data);
    process.exit(0);
  } catch (err) {
    process.send && process.send('Error: ' + err.message);
    process.exit(1);
  }
});