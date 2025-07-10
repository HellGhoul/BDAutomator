const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pendingResponses = {};

// Load collectible list
const text = fs.readFileSync("./collectibles.txt", 'utf-8');
const collectibles = text.split('\n');

// Get account ID from environment
const accountId = process.env.ACCOUNT_ID;
if (!accountId) {
  console.log('Missing ACCOUNT_ID environment variable.');
  process.exit(1);
}

console.log('🤖 Automation script started for account:', accountId);

// Function to send commands to Electron's webview via stdout
function sendCommand(command, data) {
  const message = JSON.stringify({
    type: command,
    accountId: accountId,
    data: data
  });
  console.log(`[COMMAND]${message}`);
}

// Listen for responses from stdin
process.stdin.on('data', (data) => {
  try {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'getTextContentResult' && pendingResponses[msg.requestId]) {
      pendingResponses[msg.requestId](msg.text);
      delete pendingResponses[msg.requestId];
    }
  } catch {}
});

// Function to navigate to a URL
async function navigateTo(url) {
  sendCommand('navigateTo', { url });
  return new Promise(resolve => setTimeout(resolve, 2000)); // Wait for navigation
}

// Function to wait for element
async function waitForElement(selector, timeout = 200) {
  sendCommand('waitForElement', { selector, timeout });
  // In a real implementation, we'd wait for response, but for now we'll simulate
  return new Promise(resolve => setTimeout(resolve, 100));
}

// Function to click element
async function clickElement(selector) {
  sendCommand('clickElement', { selector });
  return new Promise(resolve => setTimeout(resolve, 200));
}

// Function to get text content (with request/response)
async function getTextContent(selector) {
  const requestId = uuidv4();
  sendCommand('getTextContent', { selector, requestId });
  return new Promise(resolve => {
    pendingResponses[requestId] = resolve;
  });
}

// Main automation logic
async function nextAttack() {
  console.log('⚔️ Processing battle result...');
  
  try {
    await waitForElement('body > div.main > strong');;
    const text = await getTextContent('body > div.main > strong');
    console.log(text);
    if (text && text.includes('Congratulations! You won the battle!') || text && text.includes('You lost the battle.')) {
      console.log('🔄 Battle ended, continuing...');
      await waitForElement("body > div.main > form > input");
      await clickElement("body > div.main > form > input");
      await nextAttack();
    } else if (text && text.includes("Congratulations! You KILLED")) {
      console.log('💀 Monster killed!');
      
      let nameFull = "";
      try {
        console.log("here");
        await waitForElement("body > div.main > a", 100);

        console.log("here2");
        nameFull = await getTextContent('body > div.main > a');
      } catch (error) {
        console.log('No loot link found');
      }

      if (nameFull && (nameFull.startsWith("Rune ") || nameFull.toLowerCase().includes("magic scroll") || nameFull === "")) {
        console.log('📦 Collecting loot...');
        await waitForElement('body > div.main > form:nth-child(3) > input');
        await clickElement("body > div.main > form:nth-child(3) > input");
        await choosing();
      } else {
        console.log('💎 Valuable loot found!');
        try {
          await waitForElement("body > div.main > form:nth-child(17) > input", 100);
          await clickElement("body > div.main > form:nth-child(17) > input");
          await choosing();
        } catch {
          try {
            await waitForElement("body > div.main > form:nth-child(15) > input", 100);
            await clickElement("body > div.main > form:nth-child(15) > input");
            await choosing();
          } catch {
            try {
              await waitForElement("body > div.main > form:nth-child(13) > input", 100);
              await clickElement("body > div.main > form:nth-child(13) > input");
              await choosing();
            } catch {
              await waitForElement("body > div.main > form:nth-child(11) > input", 100);
              await clickElement("body > div.main > form:nth-child(11) > input");
              await choosing();
            }
          }
        }
      }
    }
  } catch (error) {
    console.log('❌ Error in nextAttack:', error.message);
  }
}

async function firstAttack() {
  console.log('⚔️ Starting first attack...');
  try {
    await waitForElement("body > div.main > form > input", 200);
    await clickElement("body > div.main > form > input");
    await nextAttack();
  } catch {
    try {
      await waitForElement("body > div.main > div.list.small > form > input", 500);
      await clickElement("body > div.main > div.list.small > form > input");
      await firstAttack();
    } catch {
      await nextAttack();
    }
  }
}

async function choosing() {
  console.log('🎯 Selecting target...');
  await waitForElement(".unit.round");
  await clickElement(".unit.round");
  firstAttack();
}

// Main automation function
async function startAutomation() {
  console.log('🚀 Starting automation...');
  console.log('🗺️ Navigating to maps page...');
  await navigateTo('https://blackdragon.mobi/maps/view');
  console.log('✅ Arrived at maps page, starting target selection...');
  await choosing();
}

// Start the automation
startAutomation();

// Handle process termination
process.on('SIGTERM', () => {
  console.log('🛑 Automation stopped by user');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Automation interrupted');
  process.exit(0);
});