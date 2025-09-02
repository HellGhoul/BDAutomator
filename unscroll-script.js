const puppeteer = require('puppeteer');
const fs = require('fs');
const BlackDragonHelpers = require('./blackdragon-helpers');

let helpers = null; // Global variable to store helpers instance

async function runUnscroll({ username, password, config }) {
  const browser = await puppeteer.launch({ headless: false, ignoreHTTPSErrors: true });
  const page = await browser.newPage();
  helpers = new BlackDragonHelpers(page); // Assign to global variable

  // Helper functions specific to unscroll
  async function getBossList(){
    // Navigate to boss page
    await helpers.navigateTo('https://blackdragon.mobi/quests/index');

    const monsters = await page.evaluate(() => {
      const monsterElements = Array.from(document.querySelectorAll('div.list'));
      const result = [];
    
      for (const el of monsterElements.reverse()) {
        const img = el.querySelector('img.round');
        const name = el.querySelector('strong')?.innerText?.trim();
        const url = el.querySelector('a')?.href?.trim();
    
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
    
        if (img && name && location 
        && img.src.split('/').pop() != "diamond_dragon.jpg" 
        && img.src.split('/').pop() != "blood_dragon.jpg"  
        && img.src.split('/').pop() != "supreme_archangel.jpg"
        && img.src.split('/').pop() != "hell_baron.jpg") {
          result.push({
            name,
            location,
            fileName: "/"+ img.src.split('/').pop(),
            url
          });
          break;
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
        await teleportMap(monster.location,monster.url);
      }else{
        
        await helpers.navigateTo('https://blackdragon.mobi/maps/view');
      }
      previousMap = monster.location;
      
      await selectBoss(monster.fileName);
      break;
    }
    await autoBossHunt();
  }

  async function teleportMap(mapName,url){
    await helpers.navigateTo(url);

    try{
      await helpers.clickElement("body > div.main > div.list.center > form > input", { waitForNav: true });
    }catch{

    }
  
    await helpers.clickElement("body > div.main > div.block > form > p > input", { waitForNav: true });
  }

  async function selectBoss(bossName) {
    if(config.hpThreshold > 0){
      try{
        await helpers.checkHealRecovery(config.hpThreshold);
      }catch{
        
      }
    }

    try{
      await helpers.clickElement('a img[src*="'+bossName+'"]', { waitForNav: false });
      await firstAttack();
    }catch{
      return;
    }
  }

  async function nextAttack() {
    try {
      const result = await helpers.processBattleResult(config);
      
      if (result === 'continue') {
        await nextAttack();
      } else if (result === 'looted') {
        process.send && process.send('💎 Found valuable loot!');
        return;
      } else if (result === 'continued') {
        await nextAttack();
      } else if (result === 'error') {
        await helpers.goToMaps();
        return;
      }
    } catch (error) {
      return;
    }
  }

  async function firstAttack() {
    try {
      const success = await helpers.firstAttack();
      if (success) {
        await nextAttack();
      } else {
        try {
          await nextAttack();
        } catch (error) {
          await helpers.goToMaps();
          return;
        }
      }
    } catch (error) {
      await helpers.goToMaps();
      return;
    }
  }

  // Login using shared helper
  await helpers.login(username, password);

  await autoBossHunt();

  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  
  // Clean up on stop
  process.on('SIGTERM', async () => {
    await browser.close();
    process.exit(0);
  });
}

// Listen for pause/resume messages
process.on('message', (msg) => {
  if (msg && msg.type === 'pause') {
    if (helpers) {
      helpers.setPaused(true);
      console.log('⏸️ Unscroll paused');
    }
  } else if (msg && msg.type === 'resume') {
    if (helpers) {
      helpers.setPaused(false);
      console.log('▶️ Unscroll resumed');
    }
  }
});

// Only start unscroll if the message contains username and password (initial run)
process.on('message', async (data) => {
  if (data && data.username && data.password) {
    try {
      await runUnscroll(data);
      process.exit(0);
    } catch (err) {
      process.exit(1);
    }
  }
});