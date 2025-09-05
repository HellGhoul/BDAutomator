const puppeteer = require('puppeteer');
const fs = require('fs');
const BlackDragonHelpers = require('./blackdragon-helpers');
const MultiAccountChromeDebug = require('./multi-account-chrome-debug');

let helpers = null; // Global variable to store helpers instance
let debugManager = null;

// Function to get port for account (same logic as MultiAccountChromeDebug)
function getPortForAccount(accountName) {
  const basePort = 9222;
  const hash = simpleHash(accountName);
  return basePort + (hash % 1000) + 1; // Ports 9223-10221
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

async function runAutomation({ username, password, config }) {
  process.send && process.send('Received config: ' + JSON.stringify(config));
  
  let browser;
  const port = getPortForAccount(username);
  
  try {
    console.log(`🔗 Connecting to Chrome instance for account: ${username}`);
    console.log(`   Debug port: ${port}`);
    
    // Try to connect to existing Chrome instance
    browser = await puppeteer.connect({
      browserURL: `http://localhost:${port}`,
      defaultViewport: null
    });
    
    console.log(`✅ Connected to Chrome instance for ${username}`);
    
  } catch (error) {
    console.log(`❌ Failed to connect to Chrome instance for ${username}:`, error.message);
    console.log(`💡 Make sure Chrome is running for this account:`);
    console.log(`   node multi-account-chrome-debug.js start ${username}`);
    throw new Error(`Chrome instance not found for account ${username}. Please start it first.`);
  }
  
  // Get the first available page or create a new one
  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  
  helpers = new BlackDragonHelpers(page); // Assign to global variable
  process.send && process.send('Connected to Chrome instance');

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
    //process.send && process.send('⚔️ Processing battle result...');
    try {
      const result = await helpers.processBattleResult(config);
      
      if (result === 'continue') {
        process.send && process.send('🔄 Battle ended, continuing...');
        await nextAttack();
      } else if (result === 'looted') {
        //process.send && process.send('💎 Valuable loot found!');
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
    //process.send && process.send('⚔️ Starting first attack...');
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
  try {
    console.log(`🔐 Starting login for account: ${username}`);
    await helpers.login(username, password);
    console.log(`✅ Login completed for account: ${username}`);
  } catch (error) {
    console.log(`❌ Login failed for account: ${username}:`, error.message);
    console.log('💡 Make sure you have completed Cloudflare challenges in the Chrome window');
    throw error;
  }

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
    // Don't close browser as it's managed by the debug manager
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
