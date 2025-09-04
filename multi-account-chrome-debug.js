const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

class MultiAccountChromeDebug {
  constructor() {
    this.platform = os.platform();
    this.chromePath = this.getChromePath();
    this.basePort = 9222;
    this.runningInstances = new Map(); // Store running Chrome instances
  }

  getChromePath() {
    if (this.platform === 'darwin') { // macOS
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    } else if (this.platform === 'win32') { // Windows
      return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    } else { // Linux
      return '/usr/bin/google-chrome';
    }
  }

  getPortForAccount(accountName) {
    // Generate a unique port for each account
    const hash = this.simpleHash(accountName);
    return this.basePort + (hash % 1000) + 1; // Ports 9223-10221
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  getUserDataDir(accountName) {
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

  async startChromeForAccount(accountName) {
    const port = this.getPortForAccount(accountName);
    const userDataDir = this.getUserDataDir(accountName);
    
    console.log(`🚀 Starting Chrome for account: ${accountName}`);
    console.log(`   Port: ${port}`);
    console.log(`   Profile: ${userDataDir}`);
    
    const command = `"${this.chromePath}" --remote-debugging-port=${port} --user-data-dir="${userDataDir}"`;
    
    console.log(`🔧 Command: ${command}`);
    
    return new Promise((resolve, reject) => {
      const child = exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Error starting Chrome for ${accountName}:`, error.message);
          reject(error);
        }
      });
      
      // Store the process for later cleanup
      this.runningInstances.set(accountName, {
        process: child,
        port: port,
        userDataDir: userDataDir
      });
      
      // Give Chrome time to start
      setTimeout(() => {
        console.log(`✅ Chrome started for ${accountName} on port ${port}`);
        console.log(`🌐 You can now:`);
        console.log(`   1. Visit http://localhost:${port} to see debugging info`);
        console.log(`   2. Use this Chrome to visit blackdragon.mobi`);
        console.log(`   3. Complete any Cloudflare challenges manually`);
        console.log(`   4. Run automation for this account`);
        console.log(`💡 Profile directory: ${userDataDir}`);
        resolve({ port, userDataDir, process: child });
      }, 3000);
    });
  }

  async stopChromeForAccount(accountName) {
    const instance = this.runningInstances.get(accountName);
    if (instance) {
      console.log(`🛑 Stopping Chrome for account: ${accountName}`);
      instance.process.kill();
      this.runningInstances.delete(accountName);
      console.log(`✅ Chrome stopped for ${accountName}`);
    } else {
      console.log(`⚠️ No running Chrome instance found for ${accountName}`);
    }
  }

  async stopAllChromeInstances() {
    console.log(`🛑 Stopping all Chrome instances...`);
    for (const [accountName, instance] of this.runningInstances) {
      console.log(`   Stopping ${accountName}...`);
      instance.process.kill();
    }
    this.runningInstances.clear();
    console.log(`✅ All Chrome instances stopped`);
  }

  getAccountInfo(accountName) {
    const instance = this.runningInstances.get(accountName);
    if (instance) {
      return {
        port: instance.port,
        userDataDir: instance.userDataDir,
        isRunning: true
      };
    }
    return {
      port: this.getPortForAccount(accountName),
      userDataDir: this.getUserDataDir(accountName),
      isRunning: false
    };
  }

  listRunningAccounts() {
    console.log(`📋 Running Chrome instances:`);
    if (this.runningInstances.size === 0) {
      console.log(`   No instances running`);
    } else {
      for (const [accountName, instance] of this.runningInstances) {
        console.log(`   ${accountName}: Port ${instance.port}, Profile: ${instance.userDataDir}`);
      }
    }
  }
}

// CLI Interface
if (require.main === module) {
  const debugManager = new MultiAccountChromeDebug();
  const command = process.argv[2];
  const accountName = process.argv[3];

  switch (command) {
    case 'start':
      if (!accountName) {
        console.log('❌ Please provide account name: node multi-account-chrome-debug.js start <account-name>');
        process.exit(1);
      }
      debugManager.startChromeForAccount(accountName)
        .then(() => {
          console.log(`\n🎯 Next steps for ${accountName}:`);
          console.log(`   1. Complete Cloudflare challenges in the opened Chrome`);
          console.log(`   2. Run your automation with this account`);
          console.log(`   3. Use port ${debugManager.getPortForAccount(accountName)} for debugging`);
        })
        .catch(console.error);
      break;

    case 'stop':
      if (!accountName) {
        console.log('❌ Please provide account name: node multi-account-chrome-debug.js stop <account-name>');
        process.exit(1);
      }
      debugManager.stopChromeForAccount(accountName);
      break;

    case 'stop-all':
      debugManager.stopAllChromeInstances();
      break;

    case 'list':
      debugManager.listRunningAccounts();
      break;

    case 'info':
      if (!accountName) {
        console.log('❌ Please provide account name: node multi-account-chrome-debug.js info <account-name>');
        process.exit(1);
      }
      const info = debugManager.getAccountInfo(accountName);
      console.log(`📊 Account Info for ${accountName}:`);
      console.log(`   Port: ${info.port}`);
      console.log(`   Profile: ${info.userDataDir}`);
      console.log(`   Running: ${info.isRunning}`);
      break;

    default:
      console.log('🔄 Multi-Account Chrome Debug Manager\n');
      console.log('📋 Available commands:');
      console.log('   start <account-name>  - Start Chrome for specific account');
      console.log('   stop <account-name>   - Stop Chrome for specific account');
      console.log('   stop-all              - Stop all Chrome instances');
      console.log('   list                  - List running instances');
      console.log('   info <account-name>   - Get account info');
      console.log('');
      console.log('💡 Examples:');
      console.log('   node multi-account-chrome-debug.js start korvak');
      console.log('   node multi-account-chrome-debug.js start player2');
      console.log('   node multi-account-chrome-debug.js list');
      console.log('   node multi-account-chrome-debug.js stop korvak');
      break;
  }
}

module.exports = MultiAccountChromeDebug;
