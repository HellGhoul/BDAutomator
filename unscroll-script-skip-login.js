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

async function runbosshunt({ username, password, config }) {
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
    } catch (connectError) {
      throw new Error(`Failed to start or connect to Chrome for account ${username}`);
    }
  }
  
  // Get the first available page or create a new one
  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  
  helpers = new BlackDragonHelpers(page); // Assign to global variable
  process.send && process.send('Connected to Chrome instance for bosshunt');

  // Helper functions specific to bosshunt
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
       // && img.src.split('/').pop() != "diamond_dragon.jpg" 
        //&& img.src.split('/').pop() != "blood_dragon.jpg"  
       // && img.src.split('/').pop() != "supreme_archangel.jpg"
       // && img.src.split('/').pop() != "hell_baron.jpg") 
        ){
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
    
    return monsters;
  }

  async function bosshuntBoss(boss) {
    try {
      // Navigate to boss page
      await helpers.navigateTo(boss.url);
      
      try{
        await helpers.clickElement("body > div.main > div.list.center > form > input", { waitForNav: true });
      }catch{
  
      }
    
      await helpers.clickElement("body > div.main > div.block > form > p > input", { waitForNav: true });

      await selectBoss(boss.fileName);
      await selectBoss('/bog_creeper.jpg');
    } catch (error) {
      process.send && process.send(`❌ Error bosshunting ${boss.name}: ${error.message}`);
      return false;
    }
  }
  
  async function selectBoss(bossName) {
    console.log(bossName);
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
        //process.send && process.send('💎 Found valuable loot!');
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


  // Main bosshunt loop
  try {
    while (true) {
      const bosses = await getBossList();
      
      if (bosses.length === 0) {
        break;
      }
      
      for (const boss of bosses) {
        const success = await bosshuntBoss(boss);
        if (success) {
        }
      }
    }
  } catch (error) {
    process.send && process.send(`❌ bosshunt error: ${error.message}`);
  }

  // Clean up on stop
  process.on('SIGTERM', async () => {
    process.send && process.send('🛑 bosshunt stopped by user');
    
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
      process.send && process.send('⏸️ bosshunt paused by user');
    }
  } else if (msg && msg.type === 'resume') {
    if (helpers) {
      helpers.setPaused(false);
      process.send && process.send('▶️ bosshunt resumed by user');
    }
  }
});

// Only start bosshunt if the message contains username and password (initial run)
process.on('message', async (data) => {
  if (data && data.username && data.password) {
    try {
      await runbosshunt(data);
      process.exit(0);
    } catch (err) {
      process.send && process.send('Error: ' + err.message);
      process.exit(1);
    }
  }
});
