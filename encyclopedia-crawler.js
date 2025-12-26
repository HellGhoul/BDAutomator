const puppeteer = require('puppeteer');
const BlackDragonHelpers = require('./blackdragon-helpers');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { logger } = require('./logger');

const DB_PATH = path.join(__dirname, 'AutomatorDatabase.sqlite');

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function ensureEncyclopediaTables(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS encyclopedia_items (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      isLegendary INTEGER,
      isDrop INTEGER,
      isCraftable INTEGER,
      description TEXT,
      plainAttributes TEXT,
      plainReq TEXT,
      attributes TEXT,
      requirements TEXT,
      ingredients TEXT,
      image_url TEXT,
      source TEXT,
      crawled_at TEXT
    )`
  );
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_encyclopedia_items_name ON encyclopedia_items(name)');
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_encyclopedia_items_type ON encyclopedia_items(type)');

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS encyclopedia_monsters (
      id TEXT PRIMARY KEY,
      name TEXT,
      level INTEGER,
      hp INTEGER,
      attack INTEGER,
      defense INTEGER,
      location TEXT,
      image_url TEXT,
      source TEXT,
      crawled_at TEXT
    )`
  );
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_encyclopedia_monsters_name ON encyclopedia_monsters(name)');

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS encyclopedia_translations (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      originalText TEXT,
      translatedText TEXT,
      url TEXT,
      source TEXT,
      crawled_at TEXT
    )`
  );
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_encyclopedia_translations_name ON encyclopedia_translations(name)');

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS encyclopedia_titles (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      plainAttributes TEXT,
      plainReq TEXT,
      available TEXT,
      slots TEXT,
      attributes TEXT,
      requirements TEXT,
      prefix TEXT,
      suffix TEXT,
      source TEXT,
      crawled_at TEXT
    )`
  );
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_encyclopedia_titles_name ON encyclopedia_titles(name)');

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS encyclopedia_summary (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      crawl_date TEXT,
      total_items INTEGER,
      total_monsters INTEGER,
      total_translations INTEGER,
      total_quests INTEGER,
      files TEXT
    )`
  );
}

class ItemAttributes {
  constructor(statsArray) {
    this.raw = statsArray;
    this.map = {};

    statsArray.forEach(line => {
      const [key, value] = line.split(":").map(s => s.trim());
      if (key && value !== undefined) {
        this.map[key] = value;
      }
    });
  }

  get(key) {
    return this.map[key] || null;
  }

  // Convenience getters
  get Damage() { return this.map["Damage"]; }
  get Armor() { return this.map["Armor"]; }
  get Health() { return this.map["Health"]; }
  get Mana() { return this.map["Mana"]; }
  get Dexterity() { return this.map["Dexterity"]; }
  get Wisdom() { return this.map["Wisdom"]; }
  get LifeLeech() { return this.map["Life leech"]; }
}

class ItemRequirements {
  constructor(reqsArray) {
    this.raw = reqsArray;
    this.map = {};

    reqsArray.forEach(line => {
      if (line.includes(":")) {
        const [key, value] = line.split(":").map(s => s.trim());
        if (key && value) {
          this.map[key] = value;
        }
      }
    });
  }

  get(key) {
    return this.map[key] || null;
  }

  // Convenience getters
  get Class() { return this.map["Class"]; }
  get Level() { return parseInt(this.map["Level"], 10) || null; }
}

class Item {
  constructor(json) {
    Object.assign(this, json);
    this.attributes = new ItemAttributes(json.stats || []);
    this.requirementsParsed = new ItemRequirements(json.requirements || []);
  }
}

  class EncyclopediaCrawler {
    constructor() {
      this.dataDir = './encyclopedia-data';
      this.helpers = null;
      this.ensureDataDirectory();
    }

  ensureDataDirectory() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  
  async startCrawling({ username, password, config = {} }) {
    const browser = await puppeteer.launch({ 
      headless: config.headless || false, 
      ignoreHTTPSErrors: true 
    });
    
    const page = await browser.newPage();
    this.helpers = new BlackDragonHelpers(page);
    
    try {
      console.log('Starting encyclopedia crawling...');

      // Login using shared helper
      await this.helpers.login(username, password);
      console.log('Successfully logged in to blackdragon.mobi');

      // Crawl different sections
      if(config.items){
        await this.crawlItems(this.helpers);
      }
      //await this.crawlMonsters(this.helpers);
      if(config.translations){
      await this.crawlTranslations(this.helpers);
    }
      if(config.titles){
        await this.crawlTitles(this.helpers);
      }
      // Create summary
      this.createSummary();
      await this.syncDatabase();

      console.log('Encyclopedia crawling completed successfully');
      
    } catch (error) {
      console.error('Error during crawling:', error);
      throw error;
    } finally {
      await browser.close();
    }
  }

  // Handle pause/resume messages
  handlePauseResume(paused) {
    if (this.helpers) {
      this.helpers.setPaused(paused);
    }
  }

  async crawlItems(helpers) {
    console.log('Starting to crawl items...');
    
    try {
      // Navigate to items page
      await helpers.navigateTo('https://blackdragon.mobi/library/items');
      
      // Get all item categories
      const categories = await helpers.page.evaluate(() => {
        const categoryLinks = Array.from(document.querySelectorAll('a[href*="https://blackdragon.mobi/library/items/type="]'));
        return categoryLinks.map(link => ({

          url: link.href,
          name: link.textContent.substring(2).trim()
        }));
      });

      let itemsFound = 0;
      const allItems = [];
      
      for (const category of categories) {
        try {
          await helpers.navigateTo(category.url);
          // Get pages
          await helpers.waitForElement('body > div.main > div:nth-child(3) > span', 20);
          const text = await helpers.getTextContent('body > div.main > div:nth-child(3) > span');
          const slashIndex = text.indexOf('/');
          
          if (slashIndex === -1) return;
          
          const afterslash = text.substring(slashIndex + 1);
          const maxPageNum = Number(afterslash.replace(/,/g, ""));
          for (let libPage = 1; libPage <= maxPageNum; libPage++) {

            await helpers.navigateTo(category.url + '/page=' + libPage);

            // Get all items in the current page
            const items = await helpers.page.evaluate(() => {
              const itemLinks = Array.from(document.querySelectorAll('a[href*="https://blackdragon.mobi/library/viewItem/name="]'));
              console.log(itemLinks);
              return itemLinks.map(link => ({

                url: link.href,
                name: link.textContent.substring(2).trim()
              }));

            });

            for (const item of items) {
            
            // Go into each item
            await helpers.navigateTo(item.url); 
                      // Extract item details from this item page
          const itemDetails = await helpers.page.evaluate((catName, itemName) => {
            // Look for the main item container - be more specific to avoid duplicates
            const itemContainer = document.querySelector('.main');
            if (!itemContainer) return null;
            
            const imgEl = itemContainer.querySelector('img[src*="https://blackdragon.mobi/img/1"]');
            const descEl = itemContainer.querySelector('.description, small, .desc');
            const statsEl = itemContainer.querySelector('.list');
            const reqsEl = itemContainer.querySelector('.block');
            const legendaryEl = itemContainer.querySelector('u');
            const craftableEl = itemContainer.querySelector('body > div.main > div:nth-child(1)');
            const statsRaw = statsEl ? statsEl.textContent.trim().split('  ') : [];
            const reqsRaw = reqsEl ? reqsEl.textContent.trim().split('  ') : [];


            function parseKeyValueArray(arr) {
              const result = {};
            
              arr.forEach(line => {
                if (!line.includes(":")) return;
            
                let [key, value] = line.split(":").map(s => s.trim());
                if (!key || !value) return;
            
                // Handle "Class" → keep as string
                if (key.toLowerCase() === "class") {
                  result[key] = value;
                  return;
                }
            
                // Handle "Damage"
                if (key.toLowerCase() === "damage") {
                  const [minStr, maxStr] = value.split("-").map(s => s.trim());
                  const min = parseInt(minStr.replace(/\D/g, ""), 10);
                  const max = maxStr ? parseInt(maxStr.replace(/\D/g, ""), 10) : min;
                  result["DamageMin"] = min;
                  result["DamageMax"] = max;
                  return;
                }
            
                // Handle numeric with % (convert to fraction)
                if (value.endsWith("%")) {
                  const num = parseFloat(value.replace("%", "").trim());
                  result[key] = num / 100;
                  return;
                }
            
                // Handle numeric with + or plain number
                const numeric = parseFloat(value.replace("+", "").trim());
                if (!isNaN(numeric)) {
                  result[key] = numeric;
                  return;
                }
            
                // Default fallback → keep string
                result[key] = value;
              });
            
              return result;
            }
          
          return {
              id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: itemName,
              type: catName,
              isLegendary: legendaryEl?.textContent == 'Legendary item',
              isDrop: craftableEl ? craftableEl.textContent.includes('Drop') : false,
              isCraftable: craftableEl ? craftableEl.textContent.includes('Craftable') : false,
              description: descEl ? descEl.textContent.trim() : '',
              plainAttributes: statsRaw,                        // keep raw
              plainReq: reqsRaw,                  // keep raw
              attributes: parseKeyValueArray(statsRaw),   // parsed version
              requirements: parseKeyValueArray(reqsRaw), // parsed version
              ingredients: catName == 'Recipe'? statsRaw : [],
              image_url: imgEl ? imgEl.src : '',
              source: 'encyclopedia_crawler',
              crawled_at: new Date().toISOString()
            };
          }, category.name, item.name);


          // Add item to collection (only if we found details)
          if (itemDetails) {
            allItems.push(itemDetails);
            itemsFound += 1;
            console.log(`Found ${item.name} in category: ${category.name}`);
          }

            }
          }


          
        } catch (error) {
          console.error(`Error crawling category ${category.name}:`, error);
        }
      }

      // Save all items to JSON file
      const itemsFile = path.join(this.dataDir, 'items.json');
      fs.writeFileSync(itemsFile, JSON.stringify(allItems, null, 2));
      console.log(`Total items found: ${itemsFound}`);
      console.log(`Items saved to: ${itemsFile}`);
      
    } catch (error) {
      console.error('Error crawling items:', error);
    }
  }

  async crawlMonsters(helpers) {
    console.log('Starting to crawl monsters...');
    
    try {
      // Navigate to monsters/quests page
      await helpers.navigateTo('https://blackdragon.mobi/quests/index');
      
      const monsters = await helpers.page.evaluate(() => {
        const monsterElements = Array.from(document.querySelectorAll('div.list'));
        return monsterElements.map(el => {
          const img = el.querySelector('img.round');
          const name = el.querySelector('strong')?.innerText?.trim();
          
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
          
          return {
            name,
            location,
            image_url: img ? img.src : '',
            url: el.querySelector('a')?.href || ''
          };
        }).filter(monster => monster.name && monster.location);
      });

      let monstersFound = 0;
      const allMonsters = [];
      
      for (const monster of monsters) {
        try {
          // Navigate to monster detail page
          if (monster.url) {
            await helpers.navigateTo(monster.url);
            
            // Extract monster stats
            const monsterData = await helpers.page.evaluate(() => {
              const stats = {};
              const statElements = document.querySelectorAll('strong');
              
              statElements.forEach(el => {
                const text = el.textContent.trim();
                if (text.includes('Level:')) {
                  stats.level = parseInt(text.replace('Level:', '').trim()) || 0;
                } else if (text.includes('HP:')) {
                  stats.hp = parseInt(text.replace('HP:', '').replace(/,/g, '').trim()) || 0;
                } else if (text.includes('Attack:')) {
                  stats.attack = parseInt(text.replace('Attack:', '').replace(/,/g, '').trim()) || 0;
                } else if (text.includes('Defense:')) {
                  stats.defense = parseInt(text.replace('Defense:', '').replace(/,/g, '').trim()) || 0;
                }
              });

              return stats;
            });

            // Add monster to collection
            allMonsters.push({
              id: `monster_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: monster.name,
              level: monsterData.level || 0,
              hp: monsterData.hp || 0,
              attack: monsterData.attack || 0,
              defense: monsterData.defense || 0,
              location: monster.location,
              image_url: monster.image_url,
              source: 'encyclopedia_crawler',
              crawled_at: new Date().toISOString()
            });
            
            monstersFound++;
          }
        } catch (error) {
          console.error(`Error crawling monster ${monster.name}:`, error);
        }
      }

      // Save all monsters to JSON file
      const monstersFile = path.join(this.dataDir, 'monsters.json');
      fs.writeFileSync(monstersFile, JSON.stringify(allMonsters, null, 2));
      console.log(`Total monsters found: ${monstersFound}`);
      console.log(`Monsters saved to: ${monstersFile}`);
      
    } catch (error) {
      console.error('Error crawling monsters:', error);
    }
  }

  async crawlTranslations(helpers) {
    console.log('Starting to crawl translations...');
    
    try {
      let maxPage = 251;
      let translationsFound = 0;
      let translationsError = 0;
      const allTranslations = [];
          // Get pages
          for (let libPage = 1; libPage <= maxPage; libPage++) {

          await helpers.navigateTo('https://blackdragon.mobi/translator/view/type=0/page=' + libPage);

            // Get all title in the current page
          const translations = await helpers.page.evaluate(() => {
          const translationLinks = Array.from(document.querySelectorAll('a[href*="https://blackdragon.mobi/translator/edit/id="]'));
          return translationLinks.map(link => ({

                url: link.href,
                name: link.textContent.trim()
              }));

            });

            for (const translation of translations) {
              try{
                                
                // Go into each translation
                await helpers.navigateTo(translation.url); 
                // Extract title details from this title page
                const translationDetails = await helpers.page.evaluate((translationName,url) => {
                // Look for the main translation container - be more specific to avoid duplicates
                const translationContainer = document.querySelector('.main');
                if (!translationContainer) return null;
                
                  const originalText = translationContainer.querySelector('body > div.main > div.list');
                  const translatedText = translationContainer.querySelector('textarea');
                  const id = (url.match(/id=(\d+)/) || [])[1];

              return {
                  id: `translation_${id}`,
                  name: translationName,
                  type: 'Translation',
                  originalText: originalText ? originalText.textContent.trim() : '',
                  translatedText: translatedText ? translatedText.value.trim() : '',
                  id: id,
                  url: url,
                  source: 'encyclopedia_crawler',
                  crawled_at: new Date().toISOString()
                };
              }, translation.name, translation.url);

              // Add title to collection (only if we found details)
              if (translationDetails) {
                allTranslations.push(translationDetails);
                translationsFound += 1;
                console.log(`Found ${translation.name}`);
                }
              }
              catch(error){
                logger.exception('Error loading Translation: ' + translation.name + " URL: " + translation.url, error);
                continue;
              }

            }
          }

      // Save all titles to JSON file
      const translationsFile = path.join(this.dataDir, 'translations.json');
      fs.writeFileSync(translationsFile, JSON.stringify(allTranslations, null, 2));
      console.log(`Total translation found: ${translationsFound}`);
      console.log(`Translation saved to: ${translationsFile}`);
      
    } catch (error) {
      console.error('Error crawling translations:', error);
    }
  }


  async crawlTitles(helpers) {
    console.log('Starting to crawl titles...');
    
    try {
      // Navigate to titles page
      await helpers.navigateTo('https://blackdragon.mobi/library/titles');

      let titlesFound = 0;
      const allTitles = [];
          // Get pages
          await helpers.waitForElement('body > div.main > div:nth-child(1) > span', 20);
          const text = await helpers.getTextContent('body > div.main > div:nth-child(1) > span');
          const slashIndex = text.indexOf('/');
          
          if (slashIndex === -1) return;
          
          const afterslash = text.substring(slashIndex + 1);
          const maxPageNum = Number(afterslash.replace(/,/g, ""));
          for (let libPage = 1; libPage <= maxPageNum; libPage++) {

          await helpers.navigateTo('https://blackdragon.mobi/library/titles/page=' + libPage);

            // Get all title in the current page
          const titles = await helpers.page.evaluate(() => {
          const titleLinks = Array.from(document.querySelectorAll('a[href*="https://blackdragon.mobi/library/viewTitle/name="]'));
              //console.log(titleLinks);
          return titleLinks.map(link => ({

                url: link.href,
                name: link.textContent.substring(2).trim()
              }));

            });

            for (const title of titles) {
            
            // Go into each title
            await helpers.navigateTo(title.url); 
            // Extract title details from this title page
          const titleDetails = await helpers.page.evaluate((titleName) => {
            // Look for the main title container - be more specific to avoid duplicates
            const titleContainer = document.querySelector('.main');
            if (!titleContainer) return null;
            
            const statsEl = titleContainer.querySelector('.block');
            const reqsEl = titleContainer.querySelectorAll('.block')[1];
            const availableEl = titleContainer.querySelector('.list.small');
            const avaialbleText = availableEl? availableEl.textContent:'';
            const statsRaw = statsEl ? statsEl.textContent.trim().split('  ') : [];
            const reqsRaw = reqsEl ? reqsEl.textContent.trim().split('  ') : [];
            

            function parseKeyValueArray(arr) {
              const result = {};
            
              arr.forEach(line => {
                if (!line.includes(":")) return;
            
                let [key, value] = line.split(":").map(s => s.trim());
                if (!key || !value) return;
            
                // Handle "Class" → keep as string
                if (key.toLowerCase() === "class") {
                  result[key] = value;
                  return;
                }
            
                // Handle "Damage"
                if (key.toLowerCase() === "damage") {
                  const [minStr, maxStr] = value.split("-").map(s => s.trim());
                  const min = parseInt(minStr.replace(/\D/g, ""), 10);
                  const max = maxStr ? parseInt(maxStr.replace(/\D/g, ""), 10) : min;
                  result["DamageMin"] = min;
                  result["DamageMax"] = max;
                  return;
                }
            
                // Handle numeric with % (convert to fraction)
                if (value.endsWith("%")) {
                  const num = parseFloat(value.replace("%", "").trim());
                  result[key] = num / 100;
                  return;
                }
            
                // Handle numeric with + or plain number
                const numeric = parseFloat(value.replace("+", "").trim());
                if (!isNaN(numeric)) {
                  result[key] = numeric;
                  return;
                }
            
                // Default fallback → keep string
                result[key] = value;
              });
            
              return result;
            }
          
          return {
              id: `title_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: titleName,
              type: 'Title',
              plainAttributes: statsRaw,                        // keep raw
              plainReq: reqsRaw,                  // keep raw
              available: avaialbleText,                  // keep raw
              slots: {
                Weapon: avaialbleText.includes('Weapon'),
                Shield: avaialbleText.includes('Shield'),
                Helm: avaialbleText.includes('Helm'),
                BodyArmor: avaialbleText.includes('Body Armor'),
                Boots: avaialbleText.includes('Boots'),
                Amulet: avaialbleText.includes('Amulet'),
                Ring: avaialbleText.includes('Ring'),
              },
              attributes: parseKeyValueArray(statsRaw),   // parsed version
              requirements: parseKeyValueArray(reqsRaw), // parsed version
              prefix:titleName.substring(0,titleName.indexOf('...')-1).trim(),
              suffix: titleName.substring(titleName.indexOf('...')+3).trim(),
              source: 'encyclopedia_crawler',
              crawled_at: new Date().toISOString()
            };
          }, title.name);

          // Add title to collection (only if we found details)
          if (titleDetails) {
            allTitles.push(titleDetails);
            titlesFound += 1;
            console.log(`Found ${title.name}`);
          }

            }
          }

      // Save all titles to JSON file
      const titlesFile = path.join(this.dataDir, 'titles.json');
      fs.writeFileSync(titlesFile, JSON.stringify(allTitles, null, 2));
      console.log(`Total title found: ${titlesFound}`);
      console.log(`Title saved to: ${titlesFile}`);
      
    } catch (error) {
      console.error('Error crawling titles:', error);
    }
  }

  // Create a summary file with crawl statistics
  createSummary() {
    try {
      const summary = {
        crawl_date: new Date().toISOString(),
        total_items: 0,
        total_monsters: 0,
        total_translations: 0,
        total_quests: 0,
        files: []
      };

      // Count items in each file
      const files = ['items.json', 'monsters.json', 'translations.json', 'quests.json'];
      files.forEach(filename => {
        const filepath = path.join(this.dataDir, filename);
        if (fs.existsSync(filepath)) {
          try {
            const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
            const count = Array.isArray(data) ? data.length : 0;
            
            switch (filename) {
              case 'items.json':
                summary.total_items = count;
                break;
              case 'monsters.json':
                summary.total_monsters = count;
                break;
              case 'translations.json':
                summary.total_translations = count;
                break;
              case 'quests.json':
                summary.total_quests = count;
                break;
            }
            
            summary.files.push({
              filename,
              count,
              size_bytes: fs.statSync(filepath).size
            });
          } catch (error) {
            console.error(`Error reading ${filename}:`, error.message);
          }
        }
      });

      // Save summary
      const summaryFile = path.join(this.dataDir, 'summary.json');
      fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
      console.log(`Summary saved to: ${summaryFile}`);
      console.log(`Total data: ${summary.total_items + summary.total_monsters + summary.total_translations + summary.total_quests} entries`);

    } catch (error) {
      console.error('Error creating summary:', error);
    }
  }

  async syncDatabase() {
    const db = new sqlite3.Database(DB_PATH);
    try {
      await ensureEncyclopediaTables(db);

      const items = this.readData('items');
      const monsters = this.readData('monsters');
      const translations = this.readData('translations');
      const titles = this.readData('titles');

      const summaryPath = path.join(this.dataDir, 'summary.json');
      const summary = fs.existsSync(summaryPath)
        ? JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
        : null;

      await dbRun(db, 'BEGIN TRANSACTION');
      await dbRun(db, 'DELETE FROM encyclopedia_items');
      await dbRun(db, 'DELETE FROM encyclopedia_monsters');
      await dbRun(db, 'DELETE FROM encyclopedia_translations');
      await dbRun(db, 'DELETE FROM encyclopedia_titles');
      await dbRun(db, 'DELETE FROM encyclopedia_summary');

      const itemStmt = db.prepare(
        `INSERT INTO encyclopedia_items
        (id, name, type, isLegendary, isDrop, isCraftable, description, plainAttributes, plainReq, attributes, requirements, ingredients, image_url, source, crawled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const item of items) {
        await new Promise((resolve, reject) => {
          itemStmt.run(
            [
              item.id,
              item.name,
              item.type,
              item.isLegendary ? 1 : 0,
              item.isDrop ? 1 : 0,
              item.isCraftable ? 1 : 0,
              item.description || '',
              JSON.stringify(item.plainAttributes || []),
              JSON.stringify(item.plainReq || []),
              JSON.stringify(item.attributes || {}),
              JSON.stringify(item.requirements || {}),
              JSON.stringify(item.ingredients || []),
              item.image_url || '',
              item.source || '',
              item.crawled_at || ''
            ],
            err => (err ? reject(err) : resolve())
          );
        });
      }
      itemStmt.finalize();

      const monsterStmt = db.prepare(
        `INSERT INTO encyclopedia_monsters
        (id, name, level, hp, attack, defense, location, image_url, source, crawled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const monster of monsters) {
        await new Promise((resolve, reject) => {
          monsterStmt.run(
            [
              monster.id,
              monster.name,
              monster.level || 0,
              monster.hp || 0,
              monster.attack || 0,
              monster.defense || 0,
              monster.location || '',
              monster.image_url || '',
              monster.source || '',
              monster.crawled_at || ''
            ],
            err => (err ? reject(err) : resolve())
          );
        });
      }
      monsterStmt.finalize();

      const translationStmt = db.prepare(
        `INSERT INTO encyclopedia_translations
        (id, name, type, originalText, translatedText, url, source, crawled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const translation of translations) {
        await new Promise((resolve, reject) => {
          translationStmt.run(
            [
              translation.id,
              translation.name,
              translation.type,
              translation.originalText || '',
              translation.translatedText || '',
              translation.url || '',
              translation.source || '',
              translation.crawled_at || ''
            ],
            err => (err ? reject(err) : resolve())
          );
        });
      }
      translationStmt.finalize();

      const titleStmt = db.prepare(
        `INSERT INTO encyclopedia_titles
        (id, name, type, plainAttributes, plainReq, available, slots, attributes, requirements, prefix, suffix, source, crawled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const title of titles) {
        await new Promise((resolve, reject) => {
          titleStmt.run(
            [
              title.id,
              title.name,
              title.type,
              JSON.stringify(title.plainAttributes || []),
              JSON.stringify(title.plainReq || []),
              title.available || '',
              JSON.stringify(title.slots || {}),
              JSON.stringify(title.attributes || {}),
              JSON.stringify(title.requirements || {}),
              title.prefix || '',
              title.suffix || '',
              title.source || '',
              title.crawled_at || ''
            ],
            err => (err ? reject(err) : resolve())
          );
        });
      }
      titleStmt.finalize();

      if (summary) {
        await dbRun(
          db,
          `INSERT INTO encyclopedia_summary
          (id, crawl_date, total_items, total_monsters, total_translations, total_quests, files)
          VALUES (1, ?, ?, ?, ?, ?, ?)`,
          [
            summary.crawl_date || null,
            summary.total_items || 0,
            summary.total_monsters || 0,
            summary.total_translations || 0,
            summary.total_quests || 0,
            JSON.stringify(summary.files || [])
          ]
        );
      }

      await dbRun(db, 'COMMIT');
      console.log('✅ Encyclopedia data synced to AutomatorDatabase.sqlite');
    } catch (error) {
      console.error('Error syncing encyclopedia data to database:', error);
      try {
        await dbRun(db, 'ROLLBACK');
      } catch {}
    } finally {
      db.close();
    }
  }

  // Read crawled data from JSON files
  readData(type) {
    try {
      const filepath = path.join(this.dataDir, `${type}.json`);
      if (fs.existsSync(filepath)) {
        const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        return data;
      }
      return [];
    } catch (error) {
      console.error(`Error reading ${type} data:`, error);
      return [];
    }
  }

  // Search across all data types
  searchData(query) {
    const results = {
      items: [],
      monsters: [],
      translations: [],
      quests: []
    };

    const types = ['items', 'monsters', 'translations', 'quests'];
    types.forEach(type => {
      const data = this.readData(type);
      if (Array.isArray(data)) {
        results[type] = data.filter(item => 
          item.name && item.name.toLowerCase().includes(query.toLowerCase()) ||
          (item.description && item.description.toLowerCase().includes(query.toLowerCase()))
        );
      }
    });

    return results;
  }
}

// Export the class
module.exports = EncyclopediaCrawler;

// Always set up message listener for when running as child process
let crawlerInstance = null;

process.on('message', async (data) => {
  console.log('📨 Received message:', JSON.stringify(data, null, 2));
  
  if (data && data.username && data.password) {
    console.log('✅ Starting encyclopedia crawl with credentials');
    try {
      crawlerInstance = new EncyclopediaCrawler();
      await crawlerInstance.startCrawling(data);
    process.exit(0);
    } catch (error) {
      console.error('❌ Crawling failed:', error);
      process.exit(1);
    }
  } else if (data && data.type === 'pause') {
    console.log('⏸️ Pause message received');
    if (crawlerInstance) {
      crawlerInstance.handlePauseResume(true);
    }
  } else if (data && data.type === 'resume') {
    console.log('▶️ Resume message received');
    if (crawlerInstance) {
      crawlerInstance.handlePauseResume(false);
    }
  } else {
    console.log('❌ Invalid message format - missing username/password or unknown type');
    console.log('Expected: { username: "...", password: "..." }');
    console.log('Received:', data);
  }
});

// Command line usage removed - only runs as child process from main.js
