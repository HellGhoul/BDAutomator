const puppeteer = require('puppeteer');

class BlackDragonHelpers {
  constructor(page) {
    this.page = page;
    this.paused = false;
    this.pausePromise = null;
    this.pauseResolve = null;
  }

  // Pause/Resume functionality
  checkPaused() {
    if (!this.paused) return Promise.resolve();
    if (!this.pausePromise) {
      this.pausePromise = new Promise(resolve => { this.pauseResolve = resolve; });
    }
    return this.pausePromise;
  }

  // Check if currently paused (non-blocking)
  isPaused() {
    return this.paused;
  }

  setPaused(paused) {
    this.paused = paused;
    if (!paused && this.pauseResolve) {
      this.pauseResolve();
      this.pausePromise = null;
      this.pauseResolve = null;
    }
  }

  // Common navigation and interaction functions
  async navigateTo(url) {
    await this.checkPaused();
    await this.page.goto(url, { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  async waitForElement(selector, timeout = 20) {
    await this.checkPaused();
    await this.page.waitForSelector(selector, { timeout });
  }

  async clickElement(selector, { waitForNav = false } = {}) {
    await this.checkPaused();
    if (waitForNav) {
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
        this.page.click(selector)
      ]);
    } else {
      await this.page.click(selector);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }

  async getTextContent(selector) {
    const el = await this.page.$(selector);
    if (!el) return '';
    const text = await this.page.evaluate(el => el.textContent, el);
    return text;
  }

  // Login function
  async login(username, password) {
    // First, try to go to login page to check if already logged in
    await this.navigateTo('https://blackdragon.mobi/users/login');
    
    // Check if we got redirected to index page (already logged in)
    const currentUrl = this.page.url();
    if (currentUrl.includes('/index/index/')) {
      console.log(`✅ Already logged in for account: ${username}`);
      return; // Already logged in, no need to login again
    }
    
    // If we're on login page, proceed with login
    await this.waitForElement('input[name=username]', 1000);
    
    // Clear username input first
    await this.page.click('input[name=username]', { clickCount: 3 }); // Select all text
    await this.page.keyboard.press('Delete'); // Clear the field
    
    // Type username
    await this.page.type('input[name=username]', username);
    
    // Clear password input first
    await this.waitForElement('input[name=password]');
    await this.page.click('input[name=password]', { clickCount: 3 }); // Select all text
    await this.page.keyboard.press('Delete'); // Clear the field
    
    // Type password
    await this.page.type('input[name=password]', password);
    
    // Click login button
    await this.waitForElement('.button');
    await this.clickElement('.button', { waitForNav: true });
    
    console.log(`✅ Login completed for account: ${username}`);
  }

  // Health recovery function
  async checkHealRecovery(threshold) {
    const xpath = '/html/body/div[2]/a/div';
    const [element] = await this.page.$$('xpath//' + xpath); 
    
    if (!element) return;
    
    const str = await this.page.evaluate(el => el.textContent, element);
    const slashIndex = str.indexOf('/');
    
    if (slashIndex === -1) return;
    
    const beforeSlash = str.substring(0, slashIndex);
    const num = Number(beforeSlash.replace(/,/g, ""));
    
    if (num > threshold) {
      return;
    }

    // Inventory
    await this.navigateTo('https://blackdragon.mobi/items/index/c=71012');    
    try {
      await this.waitForElement('body > div.main > div:nth-child(1) > a:nth-child(3)', 20);
      await this.clickElement("body > div.main > div:nth-child(1) > a:nth-child(3)", { waitForNav: false });
    } catch {}

    await this.navigateTo('https://blackdragon.mobi/credits/use/id=health/c=93047');    
    
    await this.clickElement("body > div.main > div.list.center > form > input", { waitForNav: true });
    await this.clickElement("body > div.main > div:nth-child(3) > form > p > input.button", { waitForNav: true });
    await this.clickElement("body > div.main > div.list > form > input.button", { waitForNav: true });

    // Go to inventory
    await this.navigateTo('https://blackdragon.mobi/items/index/c=71012');   
    
    await this.waitForElement('body > div.main > div:nth-child(1) > a:nth-child(1)', 20);
    await this.clickElement("body > div.main > div:nth-child(1) > a:nth-child(1)", { waitForNav: false }); 

    await this.navigateTo('https://blackdragon.mobi/maps/view');
  }

  // Battle result processing
  async processBattleResult(config = {}) {
    try {
      await this.waitForElement('body > div.main > strong', 20);
      const text = await this.getTextContent('body > div.main > strong');
      
      if ((text && text.includes('Congratulations! You won the battle!')) || 
          (text && text.includes('You lost the battle.'))) {
        await this.waitForElement('body > div.main > form > input', 20);
        await this.clickElement('body > div.main > form > input', { waitForNav: true });
        return 'continue';
      } else if (text && text.includes('Congratulations! You KILLED')) {
        let nameFull = '';
        let quality = '';
        
        // Try to get item name
        try {
          await this.waitForElement('body > div.main > a', 20);
          nameFull = await this.getTextContent('body > div.main > a');
        } catch (error) {
          // No loot link found
        }
        
        // Try to get item quality
        if (config.epicGear) {
          try {
            await this.waitForElement('body > div.main > span:nth-child(16)', 20);
            quality = await this.getTextContent('body > div.main > span:nth-child(16)');
          } catch (error) {
            try {
              await this.waitForElement('body > div.main > span:nth-child(18)', 20);
              quality = await this.getTextContent('body > div.main > span:nth-child(18)');
            } catch {
              // Do nothing
            }
          }
        }

        const isValuable = this.isValuableLoot(nameFull, quality, config);
        
        if (isValuable) {
          await this.waitForElement('body > div.main > form:nth-child(3) > input', 20);
          await this.clickElement("body > div.main > form:nth-child(3) > input", { waitForNav: true });
          
        process.send && process.send('💎 Valuable loot found! ' + nameFull);
          return 'looted';
        } else {
          try {
            const xpath = '/html/body/div[4]/form[2]/input';
            await this.page.waitForSelector('xpath//' + xpath, { timeout: 200 });
            const [element] = await this.page.$$('xpath//' + xpath);
            if (!element) throw new Error('Element not found');
            await Promise.all([
              this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
              element.click()
            ]);
            return 'continued';
          } catch (e) {
            await this.waitForElement('body > div.main > form:nth-child(3) > input', 20);
            await this.clickElement("body > div.main > form:nth-child(3) > input", { waitForNav: true });
            return 'looted';
          }
        }
      }
    } catch (error) {
      try {
        const xpath = '/html/body/div[4]/form[2]/input';
        await this.page.waitForSelector('xpath//' + xpath, { timeout: 200 });
        const [element] = await this.page.$$('xpath//' + xpath);
        if (!element) throw new Error('Element not found');
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
          element.click()
        ]);
        return 'continued';
      } catch (e) {
        return
      }
    }
  }
  async advanceDungeon(){
    await this.waitForElement('body > div.main > div:nth-child(1) > table > tbody > tr:nth-child(4) > td:nth-child(4) > a > img', 20);
    await this.clickElement("body > div.main > div:nth-child(1) > table > tbody > tr:nth-child(4) > td:nth-child(4) > a > img", { waitForNav: true });

    
    await this.waitForElement('body > div.main > div.center > form > input', 20);
    await this.clickElement("body > div.main > div.center > form > input", { waitForNav: true });
  }

  // Check if loot is valuable based on config
  isValuableLoot(nameFull, quality, config) {
    if (!nameFull) return false;
    const name = nameFull.toLowerCase();
    
    return config.all
      || name.includes("gold bar")
      || name.includes("antidote")
      || name.includes("undead crown")
      || name.includes("revival")
      || (config.pieceGear && name.includes("a piece of"))
      || (config.recipe && name.includes("recipe"))
      || (config.charm && name.includes("charm"))
      || (config.jewel && (name.includes("jewel") || name.includes("elixir")))
      || (config.rune && (name.includes("rune ") || name.includes("level ")))
      || (config.epicGear && (quality.toLowerCase().includes("epic") || name.includes("(iv)") || name.includes("(v)")  || name.includes("(vi)")|| 
          quality.toLowerCase().includes("mythic") || 
          quality.toLowerCase().includes("heroic") || 
          quality.toLowerCase().includes("devine")))
      || (config.magicScroll && name.includes("magic scroll"))
      || (config.monsterScroll && name.includes("s magic scroll"))
      || (config.staminaPotion && name.includes("stamina potion"))
      || (config.ancientPotion && name.includes("ancient potion"));
  }

  // First attack function
  async firstAttack() {
    try {
      await this.clickElement('body > div.main > form > input', { waitForNav: true });
      return true;
    } catch {
      try {
        await this.clickElement('body > div.main > div.list.small > form > input', { waitForNav: true });
        return true;
      } catch {
        return false;
      }
    }
  }

  // Navigate to maps
  async goToMaps() {
    await this.navigateTo('https://blackdragon.mobi/maps/view');
  }
}

module.exports = BlackDragonHelpers;
