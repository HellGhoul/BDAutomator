const puppeteer = require('puppeteer');
const fs = require('fs');
const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const BlackDragonHelpers = require('./blackdragon-helpers');

let helpers = null; // Global variable to store helpers instance
let runningChromeInstances = new Map(); // Store running Chrome instances

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

function getChromePath() {
  const platform = os.platform();
  if (platform === 'darwin') { // macOS
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else if (platform === 'win32') { // Windows
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  } else { // Linux
    return '/usr/bin/google-chrome';
  }
}

function getUserDataDir(accountName) {
  const baseDir = path.join(process.cwd(), 'chrome-profiles');
  const accountDir = path.join(baseDir, accountName.replace(/[^a-zA-Z0-9]/g, '_'));
  
  // Ensure directory exists
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
  
  console.log(`🚀 Auto-starting Chrome for account: ${accountName}`);
  console.log(`   Port: ${port}`);
  console.log(`   Profile: ${userDataDir}`);
  
  const command = `"${chromePath}" --remote-debugging-port=${port} --user-data-dir="${userDataDir}"`;
  
  return new Promise((resolve, reject) => {
    const child = exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Error starting Chrome for ${accountName}:`, error.message);
        reject(error);
      }
    });
    
    // Store the process for later cleanup
    runningChromeInstances.set(accountName, {
      process: child,
      port: port,
      userDataDir: userDataDir
    });
    
    // Give Chrome time to start
    setTimeout(async () => {
      console.log(`✅ Chrome auto-started for ${accountName} on port ${port}`);
      console.log(`🌐 Chrome window opened - complete Cloudflare challenges if needed`);
      resolve({ port, userDataDir, process: child });
    }, 3000);
  });
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
    
    console.log(`✅ Connected to existing Chrome instance for ${username}`);
    
  } catch (error) {
    console.log(`❌ No existing Chrome instance found for ${username}`);
    console.log(`🚀 Auto-starting Chrome for account: ${username}`);
    
    // Auto-start Chrome for this account
    await startChromeForAccount(username);
    
    // Wait a bit more for Chrome to fully initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Now try to connect again
    try {
      browser = await puppeteer.connect({
        browserURL: `http://localhost:${port}`,
        defaultViewport: null
      });
      console.log(`✅ Connected to auto-started Chrome instance for ${username}`);
    } catch (connectError) {
      console.log(`❌ Failed to connect to auto-started Chrome for ${username}:`, connectError.message);
      throw new Error(`Failed to start or connect to Chrome for account ${username}`);
    }
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

  // SKIP LOGIN - Just start automation directly
  console.log(`🤖 Starting automation for account: ${username} (skipping login)`);
  process.send && process.send('🤖 Starting automation (login skipped)...');

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
    
    // Stop Chrome instances that were auto-started
    for (const [accountName, instance] of runningChromeInstances) {
      console.log(`🛑 Stopping auto-started Chrome for ${accountName}`);
      instance.process.kill();
    }
    runningChromeInstances.clear();
    
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
