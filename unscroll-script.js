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
  process.send && process.send('Received boss hunt config: ' + JSON.stringify(config));
  const browser = await puppeteer.launch({ headless: false, ignoreHTTPSErrors: true });
  const page = await browser.newPage();
  process.send && process.send('Browser launched for boss hunt');


  // Helper functions
  async function navigateTo(url) {
    await checkPaused();
    await page.goto(url, { waitUntil: 'networkidle2' });
    process.send && process.send('Navigated to ' + url);
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  async function waitForElement(selector, timeout = 20) {
    await checkPaused();
    await page.waitForSelector(selector, { timeout });
  }

  async function clickElement(selector, { waitForNav = false } = {}) {
    await checkPaused();
    if (waitForNav) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click(selector)
      ]);
    } else {
      await page.click(selector);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }

  async function getTextContent(selector) {
    const el = await page.$(selector);
    if (!el) return '';
    const text = await page.evaluate(el => el.textContent, el);
    process.send && process.send('getTextContent: ' + selector + ' => ' + text);
    return text;
  }
  async function getBossList(){
  // Navigate to boss page
  await navigateTo('https://blackdragon.mobi/quests/index');

  const monsters = await page.evaluate(() => {
    const monsterElements = Array.from(document.querySelectorAll('div.list'));
    const result = [];
  
    for (const el of monsterElements) {
      const img = el.querySelector('img.round');
      const name = el.querySelector('strong')?.innerText?.trim();
  
      // Extract location after <small>@</small>
      let location = null;
      const smallTags = Array.from(el.querySelectorAll('small'));
      for (let i = 0; i < smallTags.length; i++) {
        if (smallTags[i].textContent.trim() === '@') {
          const node = smallTags[i].nextSibling;
          if (node && node.nodeType === Node.TEXT_NODE) {
            location = node.textContent.trim();
          }
          break;
        }
      }
  
      if (img && name && location && img.src.split('/').pop() != "diamond_dragon.jpg" && img.src.split('/').pop() != "ghost_behemoth.jpg") {
        result.push({
          name,
          location,
          fileName: "/"+ img.src.split('/').pop(),
        });
      }
    }

    return result;
  });
  // ✅ Sort by location (ascending)
   monsters.sort((a, b) => a.location.localeCompare(b.location));
  return monsters;
  }

  async function autoBossHunt() {
    var monsterList = [];
    var previousMap = "";
    monsterList = await getBossList();
    for(const monster of monsterList){
      console.log(monster);
      if (monster.location != previousMap){
        await teleportMap(monster.location);
      }else{
        
        await navigateTo('https://blackdragon.mobi/maps/view');
      }
      previousMap = monster.location;
      
      await selectBoss(monster.fileName);
    }
    await autoBossHunt();
  }
  async function teleportMap(mapName){
  
    await navigateTo('https://blackdragon.mobi/credits/use/id=teleport');
    //await waitForElement("body > div.main > div.list.center > form > input");
    await clickElement("body > div.main > div.list.center > form > input", { waitForNav: true });
  
    await page.evaluate((mapName) => {
      const select = document.querySelector('select[name="map"]');
      if (!select) return;
  
      for (const option of select.options) {
        if (option.textContent.trim().startsWith(mapName)) {
          select.value = option.value;
          const event = new Event('change', { bubbles: true });
          select.dispatchEvent(event);
          break;
        }
      }
    }, mapName); // 👈 Pass mapName into the browser context
    //await waitForElement("body > div.main > div.block > form > p > input");
    await clickElement("body > div.main > div.block > form > p > input", { waitForNav: true });
  }
  async function selectBoss(bossName) {
    try{
      //await waitForElement('a img[src*="'+bossName+'"]');
      await clickElement('a img[src*="'+bossName+'"]', { waitForNav: true });
      await firstAttack();
    }catch{
      return;
    }
  }

  async function nextAttack() {
    process.send && process.send('⚔️ Processing battle result...');
    try {
      await waitForElement('body > div.main > strong',20);
      const text = await getTextContent('body > div.main > strong');
      if ((text && text.includes('Congratulations! You won the battle!')) || (text && text.includes('You lost the battle.'))) {
        process.send && process.send('🔄 Battle ended, continuing...');
        //await waitForElement('body > div.main > form > input',20);
        await clickElement('body > div.main > form > input', { waitForNav: true });
        await nextAttack();
      } else if (text && text.includes('Congratulations! You KILLED')) {
        process.send && process.send('💀 Monster killed!');
        let nameFull = '';
        let quality = '';
        // Try to get item name
        try {
          await waitForElement('body > div.main > a', 20);
          nameFull = await getTextContent('body > div.main > a');
          process.send && process.send(nameFull);
        } catch (error) {
          process.send && process.send('No loot link found');
        }
        // Try to get item quality
        if(config.epicGear){try {
          //await waitForElement('body > div.main > span:nth-child(16)', 20);
          quality = await getTextContent('body > div.main > span:nth-child(16)');
        } catch (error) {
          try {
            //await waitForElement('body > div.main > span:nth-child(18)', 20);
            quality = await getTextContent('body > div.main > span:nth-child(18)');
          } catch {
          // Do nothing
          }
        }}

        if (config.all
          || nameFull.toLocaleLowerCase().includes("gold bar")
          || nameFull.toLocaleLowerCase().includes("revival")
          || (config.pieceGear && nameFull.toLocaleLowerCase().includes("a piece of"))
          || (config.recipe && nameFull.toLocaleLowerCase().includes("recipe"))
          || (config.charm && nameFull.toLocaleLowerCase().includes("charm"))
          || (config.jewel && (nameFull.toLocaleLowerCase().includes("jewel")||nameFull.toLocaleLowerCase().includes("elixir")))
          || (config.rune && (nameFull.toLocaleLowerCase().includes("rune ")||nameFull.toLocaleLowerCase().includes("level ")))
          || (config.epicGear && (nameFull.toLocaleLowerCase().includes("(vi)")||nameFull.toLocaleLowerCase().includes("(v)")||quality.toLocaleLowerCase().includes("epic")||quality.toLocaleLowerCase().includes("mythic")||quality.toLocaleLowerCase().includes("heroic")))
          || (config.magicScroll && nameFull.toLocaleLowerCase().includes("magic scroll"))
          || (config.monsterScroll && nameFull.toLocaleLowerCase().includes("s magic scroll"))
          || (config.staminaPotion && nameFull.toLocaleLowerCase().includes("stamina potion"))
          || (config.ancientPotion && nameFull.toLocaleLowerCase().includes("ancient potion"))
        ) {
            process.send && process.send('💎 Valuable loot found!');
            //await waitForElement('body > div.main > form:nth-child(3) > input',20);
            await clickElement("body > div.main > form:nth-child(3) > input", { waitForNav: true });
            return;
        } else {
          try {
            const xpath = '/html/body/div[4]/form[2]/input';
            //await page.waitForSelector('xpath//' + xpath, { timeout: 20 });
            const [element] = await page.$$('xpath//' + xpath);
            if (!element) throw new Error('Element not found');
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle2' }),
              element.click()
            ]);

            return;

          } catch (e) {
            process.send && process.send('Error with XPath! ' + e);
            // Optionally handle the case where the XPath is not found
          }
        }
      }
    } catch (error) {
      return;
    }
  }

  async function firstAttack() {
    process.send && process.send('⚔️ Starting first attack...');
    try {
      //await waitForElement('body > div.main > form > input', 20);
      await clickElement('body > div.main > form > input', { waitForNav: true });
      await nextAttack();
    } catch {
      try {
        //await waitForElement('body > div.main > div.list.small > form > input', 20);
        await clickElement('body > div.main > div.list.small > form > input', { waitForNav: true });
        await firstAttack();
      } catch {
        try {
          await nextAttack();
        } catch (error) {
          await navigateTo('https://blackdragon.mobi/maps/view');
          process.send && process.send('✅ Arrived at maps page, starting target selection...');
          return;
        }
      }
    }
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

  await autoBossHunt();

  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  
  // Clean up on stop
  process.on('SIGTERM', async () => {
    process.send && process.send('🛑 Boss Hunt stopped by user');
    await browser.close();
    process.exit(0);
  });
}

// Listen for pause/resume messages
process.on('message', (msg) => {
  if (msg && msg.type === 'pause') {
    paused = true;
    process.send && process.send('⏸️ Boss Hunt paused by user');
  } else if (msg && msg.type === 'resume') {
    paused = false;
    if (pauseResolve) pauseResolve();
    pausePromise = null;
    pauseResolve = null;
    process.send && process.send('▶️ Boss Hunt resumed by user');
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