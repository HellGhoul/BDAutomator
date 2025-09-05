#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Import the automation script
const { runAutomation } = require('./puppeteer-automation');

class SimpleAutomation {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async start() {
    console.log('🎮 BDAutomator Simple Console');
    console.log('============================\n');
    
    const config = await this.getConfiguration();
    
    if (config) {
      console.log('\n🚀 Starting automation...\n');
      try {
        await runAutomation(config);
      } catch (error) {
        console.error('❌ Automation failed:', error.message);
      }
    }
    
    this.rl.close();
  }

  async getConfiguration() {
    return new Promise((resolve) => {
      const config = {};
      
      this.rl.question('Username: ', (username) => {
        config.username = username.trim();
        
        this.rl.question('Password: ', (password) => {
          config.password = password.trim();
          
          this.rl.question('Collect All Items? (y/n, default: n): ', (all) => {
            config.config = {};
            config.config.all = all.trim().toLowerCase() === 'y';
            
            this.rl.question('Collect Recipes? (y/n, default: y): ', (recipe) => {
              config.config.recipe = recipe.trim().toLowerCase() !== 'n';
              
              this.rl.question('Collect Charms? (y/n, default: y): ', (charm) => {
                config.config.charm = charm.trim().toLowerCase() !== 'n';
                
                this.rl.question('Collect Piece Gear? (y/n, default: y): ', (pieceGear) => {
                  config.config.pieceGear = pieceGear.trim().toLowerCase() !== 'n';
                  
                  this.rl.question('Collect Jewels? (y/n, default: y): ', (jewel) => {
                    config.config.jewel = jewel.trim().toLowerCase() !== 'n';
                    
                    this.rl.question('Collect Runes? (y/n, default: y): ', (rune) => {
                      config.config.rune = rune.trim().toLowerCase() !== 'n';
                      
                      this.rl.question('Collect Epic Gear? (y/n, default: y): ', (epicGear) => {
                        config.config.epicGear = epicGear.trim().toLowerCase() !== 'n';
                        
                        this.rl.question('Collect Magic Scrolls? (y/n, default: y): ', (magicScroll) => {
                          config.config.magicScroll = magicScroll.trim().toLowerCase() !== 'n';
                          
                          this.rl.question('Collect Monster Scrolls? (y/n, default: y): ', (monsterScroll) => {
                            config.config.monsterScroll = monsterScroll.trim().toLowerCase() !== 'n';
                            
                            this.rl.question('Collect Stamina Potions? (y/n, default: y): ', (staminaPotion) => {
                              config.config.staminaPotion = staminaPotion.trim().toLowerCase() !== 'n';
                              
                              this.rl.question('Collect Ancient Potions? (y/n, default: y): ', (ancientPotion) => {
                                config.config.ancientPotion = ancientPotion.trim().toLowerCase() !== 'n';
                                
                                // Set default values for monster list and HP threshold
                                config.config.monsterList = '';
                                config.config.hpThreshold = 0;
                                
                                console.log('\n📊 Configuration:');
                                console.log(`Username: ${config.username}`);
                                console.log(`Collect All Items: ${config.config.all ? 'Yes' : 'No'}`);
                                console.log(`Collect Recipes: ${config.config.recipe ? 'Yes' : 'No'}`);
                                console.log(`Collect Charms: ${config.config.charm ? 'Yes' : 'No'}`);
                                console.log(`Collect Piece Gear: ${config.config.pieceGear ? 'Yes' : 'No'}`);
                                console.log(`Collect Jewels: ${config.config.jewel ? 'Yes' : 'No'}`);
                                console.log(`Collect Runes: ${config.config.rune ? 'Yes' : 'No'}`);
                                console.log(`Collect Epic Gear: ${config.config.epicGear ? 'Yes' : 'No'}`);
                                console.log(`Collect Magic Scrolls: ${config.config.magicScroll ? 'Yes' : 'No'}`);
                                console.log(`Collect Monster Scrolls: ${config.config.monsterScroll ? 'Yes' : 'No'}`);
                                console.log(`Collect Stamina Potions: ${config.config.staminaPotion ? 'Yes' : 'No'}`);
                                console.log(`Collect Ancient Potions: ${config.config.ancientPotion ? 'Yes' : 'No'}`);
                                console.log(`Monster List: None (default)`);
                                console.log(`HP Threshold: 0% (default)`);
                                
                                this.rl.question('\nStart automation? (y/n): ', (confirm) => {
                                  if (confirm.trim().toLowerCase() === 'y') {
                                    resolve(config);
                                  } else {
                                    console.log('❌ Automation cancelled');
                                    resolve(null);
                                  }
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
      });
    });
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Goodbye!');
  process.exit(0);
});

// Start the application
const app = new SimpleAutomation();
app.start();
