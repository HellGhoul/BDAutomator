const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const EncyclopediaService = require('./encyclopedia-service');

class EncyclopediaCrawler {
  constructor(account, sessionId, crawlOptions) {
    this.account = account;
    this.sessionId = sessionId;
    this.crawlOptions = crawlOptions || {
      items: true,
      monsters: true,
      skills: true,
      quests: true
    };
    this.encyclopedia = new EncyclopediaService();
    this.browser = null;
    this.page = null;
    this.isRunning = false;
    this.isPaused = false;
    this.stats = {
      items: 0,
      monsters: 0,
      skills: 0,
      quests: 0
    };
  }

  async start() {
    try {
      this.isRunning = true;
      this.isPaused = false;
      
      // Launch browser
      this.browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
      });

      this.page = await this.browser.newPage();
      
      // Set user agent to avoid detection
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Navigate to game login
      await this.page.goto('https://www.browserdefender.com/login', { waitUntil: 'networkidle2' });
      
      // Login to the game
      await this.login();
      
      // Start crawling different sections based on options
      await this.crawlLibrary();
      
      // Update session as completed
      await this.encyclopedia.updateCrawlSession(this.sessionId, {
        status: 'completed',
        end_time: new Date().toISOString(),
        items_found: this.stats.items,
        monsters_found: this.stats.monsters,
        skills_found: this.stats.skills,
        quests_found: this.stats.quests
      });
      
      this.sendMessage('Crawling completed successfully!');
      
    } catch (error) {
      console.error('Crawling error:', error);
      await this.encyclopedia.updateCrawlSession(this.sessionId, {
        status: 'error',
        end_time: new Date().toISOString(),
        errors: error.message
      });
      this.sendMessage(`Error during crawling: ${error.message}`);
    } finally {
      await this.cleanup();
    }
  }

  async login() {
    try {
      this.sendMessage('Logging in to the game...');
      
      // Wait for login form
      await this.page.waitForSelector('#username', { timeout: 10000 });
      
      // Fill login form
      await this.page.type('#username', this.account.username);
      await this.page.type('#password', this.account.password);
      
      // Submit form
      await this.page.click('button[type="submit"]');
      
      // Wait for login to complete
      await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
      
      this.sendMessage('Login successful!');
      
    } catch (error) {
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  async crawlLibrary() {
    try {
      this.sendMessage('Starting to crawl game library...');
      
      // Navigate to library section
      await this.page.goto('https://www.browserdefender.com/library', { waitUntil: 'networkidle2' });
      
      // Crawl different categories based on options
      if (this.crawlOptions.items) {
        await this.crawlItems();
      }
      if (this.crawlOptions.monsters) {
        await this.crawlMonsters();
      }
      if (this.crawlOptions.skills) {
        await this.crawlSkills();
      }
      if (this.crawlOptions.quests) {
        await this.crawlQuests();
      }
      
    } catch (error) {
      throw new Error(`Library crawling failed: ${error.message}`);
    }
  }

  async crawlItems() {
    try {
      this.sendMessage('Crawling items...');
      
      // Navigate to items section
      await this.page.goto('https://www.browserdefender.com/library/items', { waitUntil: 'networkidle2' });
      
      // Wait for items to load
      await this.page.waitForSelector('.item-card, .item-list, [data-item]', { timeout: 10000 });
      
      // Extract item data
      const items = await this.page.evaluate(() => {
        const itemElements = document.querySelectorAll('.item-card, .item-list, [data-item]');
        return Array.from(itemElements).map(element => {
          // Extract item information based on common selectors
          const name = element.querySelector('.item-name, .name, h3, h4')?.textContent?.trim() || 'Unknown Item';
          const type = element.querySelector('.item-type, .type, .category')?.textContent?.trim() || 'Unknown';
          const rarity = element.querySelector('.rarity, .item-rarity')?.textContent?.trim() || 'Common';
          const level = parseInt(element.querySelector('.level, .item-level')?.textContent?.match(/\d+/)?.[0]) || 1;
          const description = element.querySelector('.description, .desc, .item-desc')?.textContent?.trim() || '';
          const imageUrl = element.querySelector('img')?.src || '';
          
          // Extract stats if available
          const stats = {};
          const statElements = element.querySelectorAll('.stat, .item-stat');
          statElements.forEach(statEl => {
            const statText = statEl.textContent.trim();
            const match = statText.match(/(\w+):\s*([+-]?\d+)/);
            if (match) {
              stats[match[1]] = parseInt(match[2]);
            }
          });
          
          return {
            id: uuidv4(),
            name,
            type,
            rarity,
            level,
            stats,
            description,
            image_url: imageUrl,
            source: 'library'
          };
        });
      });
      
      // Save items to database
      for (const item of items) {
        await this.encyclopedia.upsertItem(item);
        this.stats.items++;
      }
      
      this.sendMessage(`Found and saved ${items.length} items`);
      
    } catch (error) {
      this.sendMessage(`Error crawling items: ${error.message}`);
    }
  }

  async crawlMonsters() {
    try {
      this.sendMessage('Crawling monsters...');
      
      // Navigate to monsters section
      await this.page.goto('https://www.browserdefender.com/library/monsters', { waitUntil: 'networkidle2' });
      
      // Wait for monsters to load
      await this.page.waitForSelector('.monster-card, .monster-list, [data-monster]', { timeout: 10000 });
      
      // Extract monster data
      const monsters = await this.page.evaluate(() => {
        const monsterElements = document.querySelectorAll('.monster-card, .monster-list, [data-monster]');
        return Array.from(monsterElements).map(element => {
          const name = element.querySelector('.monster-name, .name, h3, h4')?.textContent?.trim() || 'Unknown Monster';
          const level = parseInt(element.querySelector('.level, .monster-level')?.textContent?.match(/\d+/)?.[0]) || 1;
          const hp = parseInt(element.querySelector('.hp, .health')?.textContent?.match(/\d+/)?.[0]) || 100;
          const attack = parseInt(element.querySelector('.attack, .atk')?.textContent?.match(/\d+/)?.[0]) || 10;
          const defense = parseInt(element.querySelector('.defense, .def')?.textContent?.match(/\d+/)?.[0]) || 5;
          const location = element.querySelector('.location, .spawn')?.textContent?.trim() || 'Unknown';
          const imageUrl = element.querySelector('img')?.src || '';
          
          // Extract skills
          const skills = [];
          const skillElements = element.querySelectorAll('.skill, .monster-skill');
          skillElements.forEach(skillEl => {
            skills.push(skillEl.textContent.trim());
          });
          
          // Extract drops
          const drops = [];
          const dropElements = element.querySelectorAll('.drop, .loot, .reward');
          dropElements.forEach(dropEl => {
            drops.push(dropEl.textContent.trim());
          });
          
          return {
            id: uuidv4(),
            name,
            level,
            hp,
            attack,
            defense,
            skills,
            drops,
            location,
            image_url: imageUrl
          };
        });
      });
      
      // Save monsters to database
      for (const monster of monsters) {
        await this.encyclopedia.upsertMonster(monster);
        this.stats.monsters++;
      }
      
      this.sendMessage(`Found and saved ${monsters.length} monsters`);
      
    } catch (error) {
      this.sendMessage(`Error crawling monsters: ${error.message}`);
    }
  }

  async crawlSkills() {
    try {
      this.sendMessage('Crawling skills...');
      
      // Navigate to skills section
      await this.page.goto('https://www.browserdefender.com/library/skills', { waitUntil: 'networkidle2' });
      
      // Wait for skills to load
      await this.page.waitForSelector('.skill-card, .skill-list, [data-skill]', { timeout: 10000 });
      
      // Extract skill data
      const skills = await this.page.evaluate(() => {
        const skillElements = document.querySelectorAll('.skill-card, .skill-list, [data-skill]');
        return Array.from(skillElements).map(element => {
          const name = element.querySelector('.skill-name, .name, h3, h4')?.textContent?.trim() || 'Unknown Skill';
          const type = element.querySelector('.skill-type, .type, .category')?.textContent?.trim() || 'Unknown';
          const level = parseInt(element.querySelector('.level, .skill-level')?.textContent?.match(/\d+/)?.[0]) || 1;
          const cooldown = parseInt(element.querySelector('.cooldown, .cd')?.textContent?.match(/\d+/)?.[0]) || 0;
          const description = element.querySelector('.description, .desc, .skill-desc')?.textContent?.trim() || '';
          const imageUrl = element.querySelector('img')?.src || '';
          
          // Extract effects
          const effects = [];
          const effectElements = element.querySelectorAll('.effect, .skill-effect');
          effectElements.forEach(effectEl => {
            effects.push(effectEl.textContent.trim());
          });
          
          // Extract requirements
          const requirements = [];
          const reqElements = element.querySelectorAll('.requirement, .req');
          reqElements.forEach(reqEl => {
            requirements.push(reqEl.textContent.trim());
          });
          
          return {
            id: uuidv4(),
            name,
            type,
            level,
            cooldown,
            description,
            effects,
            requirements,
            image_url: imageUrl
          };
        });
      });
      
      // Save skills to database
      for (const skill of skills) {
        await this.encyclopedia.upsertSkill(skill);
        this.stats.skills++;
      }
      
      this.sendMessage(`Found and saved ${skills.length} skills`);
      
    } catch (error) {
      this.sendMessage(`Error crawling skills: ${error.message}`);
    }
  }

  async crawlQuests() {
    try {
      this.sendMessage('Crawling quests...');
      
      // Navigate to quests section
      await this.page.goto('https://www.browserdefender.com/library/quests', { waitUntil: 'networkidle2' });
      
      // Wait for quests to load
      await this.page.waitForSelector('.quest-card, .quest-list, [data-quest]', { timeout: 10000 });
      
      // Extract quest data
      const quests = await this.page.evaluate(() => {
        const questElements = document.querySelectorAll('.quest-card, .quest-list, [data-quest]');
        return Array.from(questElements).map(element => {
          const name = element.querySelector('.quest-name, .name, h3, h4')?.textContent?.trim() || 'Unknown Quest';
          const type = element.querySelector('.quest-type, .type, .category')?.textContent?.trim() || 'Unknown';
          const levelReq = parseInt(element.querySelector('.level-requirement, .level-req, .req-level')?.textContent?.match(/\d+/)?.[0]) || 1;
          const description = element.querySelector('.description, .desc, .quest-desc')?.textContent?.trim() || '';
          const npc = element.querySelector('.npc, .quest-giver')?.textContent?.trim() || 'Unknown';
          const location = element.querySelector('.location, .quest-location')?.textContent?.trim() || 'Unknown';
          
          // Extract objectives
          const objectives = [];
          const objElements = element.querySelectorAll('.objective, .quest-objective');
          objElements.forEach(objEl => {
            objectives.push(objEl.textContent.trim());
          });
          
          // Extract rewards
          const rewards = [];
          const rewardElements = element.querySelectorAll('.reward, .quest-reward');
          rewardElements.forEach(rewardEl => {
            rewards.push(rewardEl.textContent.trim());
          });
          
          return {
            id: uuidv4(),
            name,
            type,
            level_requirement: levelReq,
            description,
            objectives,
            rewards,
            npc,
            location
          };
        });
      });
      
      // Save quests to database
      for (const quest of quests) {
        await this.encyclopedia.upsertQuest(quest);
        this.stats.quests++;
      }
      
      this.sendMessage(`Found and saved ${quests.length} quests`);
      
    } catch (error) {
      this.sendMessage(`Error crawling quests: ${error.message}`);
    }
  }

  pause() {
    this.isPaused = true;
    this.sendMessage('Crawling paused');
  }

  resume() {
    this.isPaused = false;
    this.sendMessage('Crawling resumed');
  }

  stop() {
    this.isRunning = false;
    this.sendMessage('Crawling stopped');
  }

  sendMessage(message) {
    // Send message to parent process
    if (process.send) {
      process.send({
        type: 'encyclopedia-log',
        sessionId: this.sessionId,
        message: message,
        stats: this.stats
      });
    }
    console.log(`[Encyclopedia] ${message}`);
  }

  async cleanup() {
    if (this.page) {
      await this.page.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    if (this.encyclopedia) {
      this.encyclopedia.close();
    }
  }
}

// Handle process messages
process.on('message', async (data) => {
  if (data.type === 'start') {
    const crawler = new EncyclopediaCrawler(data.account, data.sessionId, data.crawlOptions);
    await crawler.start();
  } else if (data.type === 'pause') {
    // Handle pause if crawler is running
  } else if (data.type === 'resume') {
    // Handle resume if crawler is running
  } else if (data.type === 'stop') {
    // Handle stop if crawler is running
    process.exit(0);
  }
});

module.exports = EncyclopediaCrawler;
