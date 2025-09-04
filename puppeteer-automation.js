const puppeteer = require('puppeteer-core');
const fs = require('fs');
const BlackDragonHelpers = require('./blackdragon-helpers');

let helpers = null; // Global variable to store helpers instance

async function runAutomation({ username, password, config }) {
  process.send && process.send('Received config: ' + JSON.stringify(config));
  // Connect to the existing Chrome instance
  const browser = await puppeteer.connect({
    browserURL: 'http://localhost:9222', // Connects to Chrome running on the remote debugging port
  });
  const page = await browser.newPage();
  helpers = new BlackDragonHelpers(page); // Assign to global variable
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

  // Main automation logic
  async function nextAttack() {
    process.send && process.send('⚔️ Processing battle result...');
    try {
      const result = await helpers.processBattleResult(config);
      
      if (result === 'continue') {
        process.send && process.send('🔄 Battle ended, continuing...');
        await nextAttack();
      } else if (result === 'looted') {
        process.send && process.send('💎 Valuable loot found!');
        await choosing();
      } else if (result === 'continued') {
        await choosing();
      } else if (result === 'error') {
        await helpers.goToMaps();
        process.send && process.send('✅ Arrived at maps page, starting target selection...');
        await choosing();
      }else{
        await helpers.goToMaps();
        process.send && process.send('✅ Arrived at maps page, starting target selection...');
        await choosing();
      }
    } catch (error) {
      await helpers.goToMaps();
      process.send && process.send('✅ Arrived at maps page, starting target selection...');
      await choosing();
    }
  }

  async function firstAttack() {
    process.send && process.send('⚔️ Starting first attack...');
    try {
      const success = await helpers.firstAttack();
      if (success) {
        await nextAttack();
      } else {
        try {
          await nextAttack();
        } catch (error) {
          await helpers.goToMaps();
          process.send && process.send('✅ Arrived at maps page, starting target selection...');
          await choosing();
        }
      }
    } catch (error) {
      await helpers.goToMaps();
      process.send && process.send('✅ Arrived at maps page, starting target selection...');
      await choosing();
    }
  }

  async function choosing() {
    if(config.hpThreshold > 0){
      try{
        await helpers.checkHealRecovery(config.hpThreshold);
      }
      catch{

      }
    }
    
    var isTargetmonster = config.monsterList != "";
    if(isTargetmonster){
      const monsters = config.monsterList.split(",").map(m => m.trim());

      let success = false;
    
      for (const monster of monsters) {
        try {
          // try click monster
          await helpers.clickElement(`a img[src*="/${monster}.jpg"]`, { waitForNav: false });
          await firstAttack();
          success = true;
          break; // stop once we succeed
        } catch (error) {
          // just continue to next monster
        }
      }
    
      if (!success) {
        await helpers.goToMaps();
        await choosing();
      }
    }
    else
    {
      try {
        const elements = await page.$$('.unit.round');
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }),
          elements[0].click()
        ]);
        await firstAttack();
      } catch (error) {
        try{
          await helpers.advanceDungeon();
          await choosing();
        }
        catch{

          process.send && process.send('❌ Error in choosing: ' + error.message);
          process.send && process.send('🗺️ Navigating to maps page...');
          await helpers.goToMaps();
          process.send && process.send('✅ Arrived at maps page, starting target selection...');
          await choosing();
        }
      }
    }
  }

  // Login using shared helper
  await helpers.login(username, password);

  // Start automation
  process.send && process.send('🚀 Starting automation...');
  process.send && process.send('🗺️ Navigating to maps page...');
  try{
    await helpers.goToMaps();
    process.send && process.send('✅ Arrived at maps page, starting target selection...');
    await choosing();
  }
  catch{
    process.send && process.send('❌ Error in navigating to maps page');
    process.send && process.send('🗺️ Navigating to maps page...');
    await helpers.goToMaps();
    await choosing();
  }

  // Clean up on stop
  process.on('SIGTERM', async () => {
    process.send && process.send('🛑 Automation stopped by user');
    await browser.close();
    process.exit(0);
  });
}

process.on('message', (msg) => {
  if (msg && msg.type === 'pause') {
    if (helpers) {
      helpers.setPaused(true);
      process.send && process.send('⏸️ Paused by user');
    }
  } else if (msg && msg.type === 'resume') {
    if (helpers) {
      helpers.setPaused(false);
      process.send && process.send('▶️ Resumed by user');
    }
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