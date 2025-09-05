#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Import the automation script
const { runAutomation } = require('./puppeteer-automation');

class ConsoleApp {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.config = {};
    this.isRunning = false;
  }

  async start() {
    console.log('🎮 BDAutomator Console - Single Account Mode');
    console.log('============================================\n');
    
    await this.loadConfig();
    this.showMainMenu();
  }

  async loadConfig() {
    const configPath = path.join(__dirname, 'config.json');
    try {
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf8');
        this.config = JSON.parse(data);
        console.log('✅ Loaded existing configuration\n');
      }
    } catch (error) {
      console.log('ℹ️  No existing configuration found\n');
    }
  }

  async saveConfig() {
    const configPath = path.join(__dirname, 'config.json');
    try {
      fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
      console.log('✅ Configuration saved\n');
    } catch (error) {
      console.log('❌ Error saving configuration:', error.message);
    }
  }

  showMainMenu() {
    console.log('📋 Main Menu:');
    console.log('1. Configure Account');
    console.log('2. Configure Automation Settings');
    console.log('3. Start Automation');
    console.log('4. View Current Configuration');
    console.log('5. Exit');
    console.log('');

    this.rl.question('Select an option (1-5): ', (answer) => {
      switch (answer.trim()) {
        case '1':
          this.configureAccount();
          break;
        case '2':
          this.configureSettings();
          break;
        case '3':
          this.startAutomation();
          break;
        case '4':
          this.viewConfiguration();
          break;
        case '5':
          this.exit();
          break;
        default:
          console.log('❌ Invalid option. Please try again.\n');
          this.showMainMenu();
      }
    });
  }

  configureAccount() {
    console.log('\n🔐 Account Configuration');
    console.log('=======================');
    
    this.rl.question('Username: ', (username) => {
      this.config.username = username.trim();
      this.rl.question('Password: ', (password) => {
        this.config.password = password.trim();
        console.log('✅ Account configured\n');
        this.saveConfig();
        this.showMainMenu();
      });
    });
  }

  configureSettings() {
    console.log('\n⚙️  Automation Settings');
    console.log('======================');
    
    const currentConfig = this.config.config || {};
    
    this.rl.question(`Collect All Items (y/n, current: ${currentConfig.all ? 'y' : 'n'}): `, (all) => {
      if (all.trim().toLowerCase() === 'y' || all.trim().toLowerCase() === 'n') {
        this.config.config = this.config.config || {};
        this.config.config.all = all.trim().toLowerCase() === 'y';
      }
      
      this.rl.question(`Collect Recipes (y/n, current: ${currentConfig.recipe ? 'y' : 'n'}): `, (recipe) => {
        if (recipe.trim().toLowerCase() === 'y' || recipe.trim().toLowerCase() === 'n') {
          this.config.config = this.config.config || {};
          this.config.config.recipe = recipe.trim().toLowerCase() === 'y';
        }
        
        this.rl.question(`Collect Charms (y/n, current: ${currentConfig.charm ? 'y' : 'n'}): `, (charm) => {
          if (charm.trim().toLowerCase() === 'y' || charm.trim().toLowerCase() === 'n') {
            this.config.config = this.config.config || {};
            this.config.config.charm = charm.trim().toLowerCase() === 'y';
          }
          
          this.rl.question(`Collect Piece Gear (y/n, current: ${currentConfig.pieceGear ? 'y' : 'n'}): `, (pieceGear) => {
            if (pieceGear.trim().toLowerCase() === 'y' || pieceGear.trim().toLowerCase() === 'n') {
              this.config.config = this.config.config || {};
              this.config.config.pieceGear = pieceGear.trim().toLowerCase() === 'y';
            }
            
            this.rl.question(`Collect Jewels (y/n, current: ${currentConfig.jewel ? 'y' : 'n'}): `, (jewel) => {
              if (jewel.trim().toLowerCase() === 'y' || jewel.trim().toLowerCase() === 'n') {
                this.config.config = this.config.config || {};
                this.config.config.jewel = jewel.trim().toLowerCase() === 'y';
              }
              
              this.rl.question(`Collect Runes (y/n, current: ${currentConfig.rune ? 'y' : 'n'}): `, (rune) => {
                if (rune.trim().toLowerCase() === 'y' || rune.trim().toLowerCase() === 'n') {
                  this.config.config = this.config.config || {};
                  this.config.config.rune = rune.trim().toLowerCase() === 'y';
                }
                
                this.rl.question(`Collect Epic Gear (y/n, current: ${currentConfig.epicGear ? 'y' : 'n'}): `, (epicGear) => {
                  if (epicGear.trim().toLowerCase() === 'y' || epicGear.trim().toLowerCase() === 'n') {
                    this.config.config = this.config.config || {};
                    this.config.config.epicGear = epicGear.trim().toLowerCase() === 'y';
                  }
                  
                  this.rl.question(`Collect Magic Scrolls (y/n, current: ${currentConfig.magicScroll ? 'y' : 'n'}): `, (magicScroll) => {
                    if (magicScroll.trim().toLowerCase() === 'y' || magicScroll.trim().toLowerCase() === 'n') {
                      this.config.config = this.config.config || {};
                      this.config.config.magicScroll = magicScroll.trim().toLowerCase() === 'y';
                    }
                    
                    this.rl.question(`Collect Monster Scrolls (y/n, current: ${currentConfig.monsterScroll ? 'y' : 'n'}): `, (monsterScroll) => {
                      if (monsterScroll.trim().toLowerCase() === 'y' || monsterScroll.trim().toLowerCase() === 'n') {
                        this.config.config = this.config.config || {};
                        this.config.config.monsterScroll = monsterScroll.trim().toLowerCase() === 'y';
                      }
                      
                      this.rl.question(`Collect Stamina Potions (y/n, current: ${currentConfig.staminaPotion ? 'y' : 'n'}): `, (staminaPotion) => {
                        if (staminaPotion.trim().toLowerCase() === 'y' || staminaPotion.trim().toLowerCase() === 'n') {
                          this.config.config = this.config.config || {};
                          this.config.config.staminaPotion = staminaPotion.trim().toLowerCase() === 'y';
                        }
                        
                        this.rl.question(`Collect Ancient Potions (y/n, current: ${currentConfig.ancientPotion ? 'y' : 'n'}): `, (ancientPotion) => {
                          if (ancientPotion.trim().toLowerCase() === 'y' || ancientPotion.trim().toLowerCase() === 'n') {
                            this.config.config = this.config.config || {};
                            this.config.config.ancientPotion = ancientPotion.trim().toLowerCase() === 'y';
                          }
                          
                          this.rl.question(`Monster List (comma-separated, current: ${currentConfig.monsterList || 'None'}): `, (monsterList) => {
                            if (monsterList.trim()) {
                              this.config.config = this.config.config || {};
                              this.config.config.monsterList = monsterList.trim();
                            }
                            
                            this.rl.question(`HP Threshold (0-100, current: ${currentConfig.hpThreshold || 0}): `, (hpThreshold) => {
                              if (hpThreshold.trim()) {
                                this.config.config = this.config.config || {};
                                this.config.config.hpThreshold = parseInt(hpThreshold.trim()) || 0;
                              }
                              
                              console.log('✅ Settings configured\n');
                              this.saveConfig();
                              this.showMainMenu();
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  async startAutomation() {
    if (!this.config.username || !this.config.password) {
      console.log('❌ Please configure account first\n');
      this.showMainMenu();
      return;
    }

    if (this.isRunning) {
      console.log('❌ Automation is already running\n');
      this.showMainMenu();
      return;
    }

    console.log('\n🚀 Starting Automation...');
    console.log('========================');
    console.log(`Account: ${this.config.username}`);
    console.log(`Target Level: ${this.config.config?.targetLevel || 'Any'}`);
    console.log(`Level Range: ${this.config.config?.minLevel || 1} - ${this.config.config?.maxLevel || 999}`);
    console.log(`Auto Hunt: ${this.config.config?.autoHunt ? 'Yes' : 'No'}`);
    console.log(`Auto Collect: ${this.config.config?.autoCollect ? 'Yes' : 'No'}`);
    console.log('\nPress Ctrl+C to stop automation\n');

    this.isRunning = true;

    try {
      // Start the automation process
      const automationProcess = spawn('node', ['puppeteer-automation.js'], {
        cwd: __dirname,
        stdio: ['pipe', 'inherit', 'inherit']
      });

      // Send configuration to the automation process
      automationProcess.stdin.write(JSON.stringify({
        username: this.config.username,
        password: this.config.password,
        config: this.config.config || {}
      }) + '\n');
      
      automationProcess.stdin.end();

      automationProcess.on('close', (code) => {
        this.isRunning = false;
        console.log(`\n🛑 Automation stopped with code ${code}\n`);
        this.showMainMenu();
      });

      automationProcess.on('error', (error) => {
        this.isRunning = false;
        console.log(`\n❌ Automation error: ${error.message}\n`);
        this.showMainMenu();
      });

    } catch (error) {
      this.isRunning = false;
      console.log(`\n❌ Failed to start automation: ${error.message}\n`);
      this.showMainMenu();
    }
  }

  viewConfiguration() {
    console.log('\n📊 Current Configuration');
    console.log('========================');
    console.log(`Username: ${this.config.username || 'Not set'}`);
    console.log(`Password: ${this.config.password ? '***' : 'Not set'}`);
    console.log(`Collect All Items: ${this.config.config?.all ? 'Yes' : 'No'}`);
    console.log(`Collect Recipes: ${this.config.config?.recipe ? 'Yes' : 'No'}`);
    console.log(`Collect Charms: ${this.config.config?.charm ? 'Yes' : 'No'}`);
    console.log(`Collect Piece Gear: ${this.config.config?.pieceGear ? 'Yes' : 'No'}`);
    console.log(`Collect Jewels: ${this.config.config?.jewel ? 'Yes' : 'No'}`);
    console.log(`Collect Runes: ${this.config.config?.rune ? 'Yes' : 'No'}`);
    console.log(`Collect Epic Gear: ${this.config.config?.epicGear ? 'Yes' : 'No'}`);
    console.log(`Collect Magic Scrolls: ${this.config.config?.magicScroll ? 'Yes' : 'No'}`);
    console.log(`Collect Monster Scrolls: ${this.config.config?.monsterScroll ? 'Yes' : 'No'}`);
    console.log(`Collect Stamina Potions: ${this.config.config?.staminaPotion ? 'Yes' : 'No'}`);
    console.log(`Collect Ancient Potions: ${this.config.config?.ancientPotion ? 'Yes' : 'No'}`);
    console.log(`Monster List: ${this.config.config?.monsterList || 'None'}`);
    console.log(`HP Threshold: ${this.config.config?.hpThreshold || 0}%`);
    console.log('');
    this.showMainMenu();
  }

  exit() {
    console.log('\n👋 Goodbye!');
    this.rl.close();
    process.exit(0);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Goodbye!');
  process.exit(0);
});

// Start the application
const app = new ConsoleApp();
app.start();
