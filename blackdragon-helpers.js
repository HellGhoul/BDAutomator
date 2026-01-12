class BlackDragonHelpers {
  constructor(page, options = {}) {
    this.page = page;
    this.paused = false;
    this.pausePromise = null;
    this.pauseResolve = null;
    this.baseUrl = options.baseUrl || 'https://blackdragon.mobi';
    this.waitUntil = options.waitUntil || 'domcontentloaded';
    this.timeouts = {
      short: 1000,
      medium: 2000,
      long: 1500,
      nav: 1000,
      ...(options.timeouts || {})
    };
    this.delays = {
      afterNav: 20,
      afterClick: 20,
      ...(options.delays || {})
    };
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
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  buildUrl(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `${this.baseUrl}${path}`;
  }

  async navigateTo(pathOrUrl, { waitUntil } = {}) {
    await this.checkPaused();
    await this.page.goto(this.buildUrl(pathOrUrl), { waitUntil: waitUntil || this.waitUntil });
    await this.sleep(this.delays.afterNav);
  }

  async waitForElement(selector, timeout = this.timeouts.short, options = {}) {
    await this.checkPaused();
    await this.page.waitForSelector(selector, { timeout, ...options });
  }

  async clickElement(selector, { waitForNav = false, timeout, waitUntil } = {}) {
    await this.checkPaused();
    if (waitForNav) {
      await Promise.all([
        this.page.waitForNavigation({
          waitUntil: waitUntil || this.waitUntil,
          timeout: timeout || this.timeouts.nav
        }),
        this.page.click(selector)
      ]);
    } else {
      await this.page.click(selector);
      await this.sleep(this.delays.afterClick);
    }
  }

  async getTextContent(selector) {
    try {
      return await this.page.$eval(selector, el => el.textContent || '');
    } catch {
      return '';
    }
  }

  async getXpathElement(xpath) {
    const selector = `xpath//${xpath}`;
    const elements = await this.page.$$(selector);
    return elements[0] || null;
  }

  async tryClickXpath(xpath, { waitForNav = false, timeout, waitUntil } = {}) {
    const selector = `xpath//${xpath}`;
    try {
      await this.page.waitForSelector(selector, { timeout: timeout || this.timeouts.short });
      const [element] = await this.page.$$(selector);
      if (!element) return false;
      if (waitForNav) {
        await Promise.all([
          this.page.waitForNavigation({
            waitUntil: waitUntil || this.waitUntil,
            timeout: timeout || this.timeouts.nav
          }),
          element.click()
        ]);
      } else {
        await element.click();
        await this.sleep(this.delays.afterClick);
      }
      return true;
    } catch {
      return false;
    }
  }

  // Login function
  async login(username, password) {
    // First, try to go to login page to check if already logged in
    await this.navigateTo('/users/login');
    
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
    const element = await this.getXpathElement(xpath);
    
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
    await this.navigateTo('/items/index/c=71012');
    try {
      await this.waitForElement('body > div.main > div:nth-child(1) > a:nth-child(3)', this.timeouts.short);
      await this.clickElement("body > div.main > div:nth-child(1) > a:nth-child(3)", { waitForNav: false });
    } catch {}

    await this.navigateTo('/credits/use/id=health/c=93047');
    
    await this.clickElement("body > div.main > div.list.center > form > input", { waitForNav: true });
    await this.clickElement("body > div.main > div:nth-child(3) > form > p > input.button", { waitForNav: true });
    await this.clickElement("body > div.main > div.list > form > input.button", { waitForNav: true });

    // Go to inventory
    await this.navigateTo('/items/index/c=71012');
    
    await this.waitForElement('body > div.main > div:nth-child(1) > a:nth-child(1)', this.timeouts.short);
    await this.clickElement("body > div.main > div:nth-child(1) > a:nth-child(1)", { waitForNav: false }); 

    await this.navigateTo('/maps/view');
  }

  // Battle result processing
  async processBattleResult(config = {}) {
    try {
      await this.waitForElement('body > div.main > strong', this.timeouts.medium);
      const text = await this.getTextContent('body > div.main > strong');
      const text2 = await this.getTextContent('body > div.main > div:nth-child(3)');
      
      if ((text && text.includes('Congratulations! You won the battle!')) || 
          (text && text.includes('You lost the battle.')) ||
          (text2 && text2.includes('Please wait a bit before attacking again.'))) {
            await this.sleep(200);
        await this.waitForElement('body > div.main > form > input', this.timeouts.short);
        await this.clickElement('body > div.main > form > input', { waitForNav: true });
        return 'continue';
      } else if (text && text.includes('Congratulations! You KILLED')) {
        let nameFull = '';
        let quality = '';
        
        // Try to get item name
        try {
          await this.waitForElement('body > div.main > a', this.timeouts.short);
          nameFull = await this.getTextContent('body > div.main > a');
        } catch (error) {
          // No loot link found
        }
        
        // Try to get item quality
        if (config.epicGear) {
          try {
            await this.waitForElement('body > div.main > span:nth-child(16)', this.timeouts.short);
            quality = await this.getTextContent('body > div.main > span:nth-child(16)');
          } catch (error) {
            try {
              await this.waitForElement('body > div.main > span:nth-child(18)', this.timeouts.short);
              quality = await this.getTextContent('body > div.main > span:nth-child(18)');
            } catch {
              // Do nothing
            }
          }
        }

        const isValuable = this.isValuableLoot(nameFull, quality, config);
        
        if (isValuable && nameFull !='') {
          await this.waitForElement('body > div.main > form:nth-child(3) > input', this.timeouts.short);
          await this.clickElement("body > div.main > form:nth-child(3) > input", { waitForNav: true });
          
        process.send && process.send('💎 Valuable loot found! ' + nameFull);
          return 'looted';
        } else {
          try {
            const xpath = '/html/body/div[4]/form[2]/input';
            const clicked = await this.tryClickXpath(xpath, {
              waitForNav: true,
              timeout: this.timeouts.short
            });
            if (!clicked) throw new Error('Element not found');
            return 'continued';
          } catch (e) {
            await this.waitForElement('body > div.main > form:nth-child(3) > input', this.timeouts.short);
            await this.clickElement("body > div.main > form:nth-child(3) > input", { waitForNav: true });
            return 'looted';
          }
        }
      }
    } catch (error) {
      try {
        const xpath = '/html/body/div[4]/form[2]/input';
        const clicked = await this.tryClickXpath(xpath, {
          waitForNav: true,
          timeout: this.timeouts.short
        });
        return clicked ? 'continued' : undefined;
      } catch (e) {
        return
      }
    }
  }
  async advanceDungeon(){
    await this.waitForElement('body > div.main > div:nth-child(1) > table > tbody > tr:nth-child(4) > td:nth-child(4) > a > img', this.timeouts.short);
    await this.clickElement("body > div.main > div:nth-child(1) > table > tbody > tr:nth-child(4) > td:nth-child(4) > a > img", { waitForNav: true });

    
    await this.waitForElement('body > div.main > div.center > form > input', this.timeouts.short);
    await this.clickElement("body > div.main > div.center > form > input", { waitForNav: true });
  }

  // Check if loot is valuable based on config
  isValuableLoot(nameFull, quality, config) {
    if (!nameFull) return false;
    const name = nameFull.toLowerCase();
    const qualityLower = (quality || '').toLowerCase();
    const epicQuality = ['epic', 'mythic', 'heroic', 'devine'];
    const hasEpicQuality = epicQuality.some(q => qualityLower.includes(q));
    const lootListRaw = (config && config.lootItemList) ? String(config.lootItemList) : '';
    const lootList = lootListRaw
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean);
    const matchesLootList = lootList.some(item => name.includes(item));
    
    return config.all
      || name.includes('gold bar')
      || name.includes('antidote')
      || name.includes('undead crown')
      || name.includes('revival')
      || matchesLootList
      || (config.pieceGear && name.includes('a piece of'))
      || (config.recipe && name.includes('recipe'))
      || (config.charm && name.includes('charm'))
      || (config.jewel && (name.includes('jewel') || name.includes('elixir')))
      || (config.rune && (name.includes('rune ') || name.includes('level ')))
      || (config.epicGear && (hasEpicQuality || /\((iv|v|vi)\)/.test(name)))
      || (config.magicScroll && name.includes('magic scroll'))
      || (config.monsterScroll && name.includes('\'s') && name.includes('magic scroll'))
      || (config.staminaPotion && name.includes('stamina potion'))
      || (config.ancientPotion && name.includes('ancient potion'));
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
    await this.navigateTo('/maps/view');
  }
}

module.exports = BlackDragonHelpers;
