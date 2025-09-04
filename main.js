const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { fork } = require('child_process');
const DependencyAnalyzer = require('./dependency-analyzer');
const { logger } = require('./logger');

let win;
let automationProcesses = {}; // { accountId: childProcess }
let automationWindows = {}; // { accountId: BrowserWindow }
let puppeteerProcesses = {};
let unscrollProcesses = {};
let encyclopediaProcesses = {}; // { accountId: childProcess }
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true
    }
  });
  //win.maximize();
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

ipcMain.handle('get-accounts', () => {
  if (!fs.existsSync(ACCOUNTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
});

ipcMain.handle('save-accounts', (event, accounts) => {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
  return true;
});

ipcMain.handle('is-running', (event, accountId) => {
  return !!automationWindows[accountId];
});

ipcMain.handle('start-automation', async (event, account) => {
  if (puppeteerProcesses[account.id]) return false; // Already running

  const child = fork(path.join(__dirname, 'puppeteer-automation.js'));
  puppeteerProcesses[account.id] = child;

  // Send credentials and config to child
  child.send({ username: account.username, password: account.password, config: account.config });

  // Listen for logs or status from child
  child.on('message', (msg) => {
    win.webContents.send('automation-log', { accountId: account.id, log: msg });
  });

  child.on('exit', () => {
    delete puppeteerProcesses[account.id];
    win.webContents.send('automation-exit', { accountId: account.id });
  });

  return true;
});

// New handler: Start automation with login (same as start-automation)
ipcMain.handle('start-automation-with-login', async (event, account) => {
  if (puppeteerProcesses[account.id]) return false; // Already running

  const child = fork(path.join(__dirname, 'puppeteer-automation.js'));
  puppeteerProcesses[account.id] = child;

  // Send credentials and config to child
  child.send({ username: account.username, password: account.password, config: account.config });

  // Listen for logs or status from child
  child.on('message', (msg) => {
    win.webContents.send('automation-log', { accountId: account.id, log: msg });
  });

  child.on('exit', () => {
    delete puppeteerProcesses[account.id];
    win.webContents.send('automation-exit', { accountId: account.id });
  });

  return true;
});

// New handler: Start automation without login (skip login step)
ipcMain.handle('start-automation-skip-login', async (event, account) => {
  if (puppeteerProcesses[account.id]) return false; // Already running

  const child = fork(path.join(__dirname, 'puppeteer-automation-skip-login.js'));
  puppeteerProcesses[account.id] = child;

  // Send credentials and config to child
  child.send({ username: account.username, password: account.password, config: account.config });

  // Listen for logs or status from child
  child.on('message', (msg) => {
    win.webContents.send('automation-log', { accountId: account.id, log: msg });
  });

  child.on('exit', () => {
    delete puppeteerProcesses[account.id];
    win.webContents.send('automation-exit', { accountId: account.id });
  });

  return true;
});

ipcMain.on('start-auto-script', (event, { accountId }) => {
  const autoWin = automationWindows[accountId];
  if (autoWin) {
    console.log(`[Main] Sending start-automation-script to window for ${accountId}`);
    autoWin.webContents.send('start-automation-script', { accountId });
  } else {
    console.log(`[Main] No automation window found for start-auto-script: ${accountId}`);
  }
});

ipcMain.on('stop-auto-script', (event, { accountId }) => {
  const autoWin = automationWindows[accountId];
  if (autoWin) {
    console.log(`[Main] Sending stop-automation-script to window for ${accountId}`);
    autoWin.webContents.send('stop-automation-script', { accountId });
  } else {
    console.log(`[Main] No automation window found for stop-auto-script: ${accountId}`);
  }
});

ipcMain.handle('stop-automation', (event, accountId) => {
  if (puppeteerProcesses[accountId]) {
    puppeteerProcesses[accountId].kill();
    delete puppeteerProcesses[accountId];
    return true;
  }
  return false;
});

// New handler: Stop browser for specific account
ipcMain.handle('stop-browser', async (event, accountId) => {
  const account = accounts.find(acc => acc.id === accountId);
  if (!account) return false;
  
  // Kill the Chrome process for this specific account
  const { exec } = require('child_process');
  const os = require('os');
  const path = require('path');
  
  const platform = os.platform();
  let chromePath;
  
  if (platform === 'darwin') { // macOS
    chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else if (platform === 'win32') { // Windows
    chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  } else { // Linux
    chromePath = '/usr/bin/google-chrome';
  }
  
  const accountDir = path.join(process.cwd(), 'chrome-profiles', account.username.replace(/[^a-zA-Z0-9]/g, '_'));
  
  // Kill Chrome processes for this specific profile
  if (platform === 'win32') {
    exec(`taskkill /f /im chrome.exe /fi "WINDOWTITLE eq *${accountDir}*"`, (error) => {
      if (error) console.log('Chrome process not found or already closed');
    });
  } else {
    exec(`pkill -f "chrome-profiles/${account.username.replace(/[^a-zA-Z0-9]/g, '_')}"`, (error) => {
      if (error) console.log('Chrome process not found or already closed');
    });
  }
  
  return true;
});

ipcMain.handle('is-automation-running', (event, accountId) => {
  return !!automationWindows[accountId];
});

ipcMain.on('pause-automation', (event, { accountId }) => {
  const child = puppeteerProcesses[accountId];
  if (child) {
    child.send({ type: 'pause' });
  }
});

ipcMain.on('resume-automation', (event, { accountId }) => {
  const child = puppeteerProcesses[accountId];
  if (child) {
    child.send({ type: 'resume' });
  }
});

ipcMain.handle('start-unscroll', async (event, account) => {
  if (unscrollProcesses[account.id]) return false; // Already running

  const child = fork(path.join(__dirname, 'unscroll-script.js'));
  unscrollProcesses[account.id] = child;

  // Send credentials and config to child
  child.send({ username: account.username, password: account.password, config: account.config });

  // Listen for logs or status from child
  child.on('message', (msg) => {
    win.webContents.send('unscroll-log', { accountId: account.id, log: msg });
  });

  child.on('exit', () => {
    delete unscrollProcesses[account.id];
    win.webContents.send('unscroll-exit', { accountId: account.id });
  });

  return true;
});

// New handler: Start unscroll without login (skip login step)
ipcMain.handle('start-unscroll-skip-login', async (event, account) => {
  if (unscrollProcesses[account.id]) return false; // Already running

  const child = fork(path.join(__dirname, 'unscroll-script-skip-login.js'));
  unscrollProcesses[account.id] = child;

  // Send credentials and config to child
  child.send({ username: account.username, password: account.password, config: account.config });

  // Listen for logs or status from child
  child.on('message', (msg) => {
    win.webContents.send('unscroll-log', { accountId: account.id, log: msg });
  });

  child.on('exit', () => {
    delete unscrollProcesses[account.id];
    win.webContents.send('unscroll-exit', { accountId: account.id });
  });

  return true;
});

ipcMain.on('pause-unscroll', (event, { accountId }) => {
  const child = unscrollProcesses[accountId];
  if (child) {
    child.send({ type: 'pause' });
  }
});

ipcMain.on('resume-unscroll', (event, { accountId }) => {
  const child = unscrollProcesses[accountId];
  if (child) {
    child.send({ type: 'resume' });
  }
});

ipcMain.handle('stop-unscroll', (event, accountId) => {
  if (unscrollProcesses[accountId]) {
    unscrollProcesses[accountId].kill();
    delete unscrollProcesses[accountId];
    return true;
  }
  return false;
});

ipcMain.handle('is-unscroll-running', (event, accountId) => {
  return !!unscrollProcesses[accountId];
});

ipcMain.handle('start-encyclopedia-crawl', async (event, account, crawlOptions) => {
  console.log('🚀 Starting encyclopedia crawl for account:', JSON.stringify(account, null, 2));
  console.log('📋 Crawl options:', JSON.stringify(crawlOptions, null, 2));
  
  if (encyclopediaProcesses[account.id]) return false; // Already running

  const child = fork(path.join(__dirname, 'encyclopedia-crawler.js'));
  encyclopediaProcesses[account.id] = child;

  // Send credentials and crawl options to child
  const messageData = { 
    username: account.username, 
    password: account.password, 
    config: crawlOptions || {}
  };
  console.log('📤 Sending to encyclopedia crawler:', JSON.stringify(messageData, null, 2));
  child.send(messageData);

  // Listen for logs or status from child
  child.on('message', (msg) => {
      win.webContents.send('encyclopedia-log', {
        accountId: account.id,
      log: msg
      });
  });

  child.on('exit', () => {
    delete encyclopediaProcesses[account.id];
    win.webContents.send('encyclopedia-exit', { accountId: account.id });
  });

  return true;
});

ipcMain.handle('stop-encyclopedia-crawl', (event, accountId) => {
  if (encyclopediaProcesses[accountId]) {
    encyclopediaProcesses[accountId].send({ type: 'stop' });
    encyclopediaProcesses[accountId].kill();
    delete encyclopediaProcesses[accountId];
    return true;
  }
  return false;
});

ipcMain.handle('is-encyclopedia-crawl-running', (event, accountId) => {
  return !!encyclopediaProcesses[accountId];
});

ipcMain.on('pause-encyclopedia-crawl', (event, { accountId }) => {
  const child = encyclopediaProcesses[accountId];
  if (child) {
    child.send({ type: 'pause' });
  }
});

ipcMain.on('resume-encyclopedia-crawl', (event, { accountId }) => {
  const child = encyclopediaProcesses[accountId];
  if (child) {
    child.send({ type: 'resume' });
  }
});

// Encyclopedia data retrieval handlers - now using JSON files
ipcMain.handle('get-encyclopedia-stats', async () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const dataDir = './encyclopedia-data';
    const summaryFile = path.join(dataDir, 'summary.json');
    
    if (fs.existsSync(summaryFile)) {
      const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
      return summary;
    }
    return { total_items: 0, total_monsters: 0, total_translations: 0, total_titles: 0 };
  } catch (error) {
    console.error('Error getting encyclopedia stats:', error);
    return { total_items: 0, total_monsters: 0, total_translations: 0, total_titles: 0 };
  }
});

ipcMain.handle('get-encyclopedia-items', async (event, filters = {}) => {
  try {
    console.log('🔍 get-encyclopedia-items called with filters:', filters);
    const fs = require('fs');
    const path = require('path');
    const dataDir = './encyclopedia-data';
    const itemsFile = path.join(dataDir, 'items.json');
    
    if (!fs.existsSync(itemsFile)) {
      console.log('❌ Items file not found');
      return [];
    }
    
    let items = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
    console.log('📊 Loaded items, total count:', items.length);
    
    // Apply filters
    if (filters.type) {
      if (filters.type === 'accessories') {
        // Special case for accessories - include rings, amulets, gems, runes
        items = items.filter(item => ['Ring', 'Amulet', 'Gem', 'Rune'].includes(item.type));
      } else if (filters.type === 'armor') {
        // Special case for armor - include helmets, body armor, boots, shields
        items = items.filter(item => ['Helm', 'Body Armor', 'Boots', 'Shield'].includes(item.type));
      } else {
        items = items.filter(item => item.type === filters.type);
      }
    }
    
    if (filters.class) {
      items = items.filter(item => item.requirements && item.requirements.Class === filters.class);
    }
    
    if (filters.levelMin !== null && filters.levelMin !== undefined) {
      items = items.filter(item => item.requirements && item.requirements.Level >= filters.levelMin);
    }
    
    if (filters.levelMax !== null && filters.levelMax !== undefined) {
      items = items.filter(item => item.requirements && item.requirements.Level <= filters.levelMax);
    }
    
    if (filters.legendaryOnly) {
      items = items.filter(item => item.isLegendary === true);
    }
    
    if (filters.dropsOnly) {
      items = items.filter(item => item.isDrop === true);
    }
    
    if (filters.craftableOnly) {
      items = items.filter(item => item.isCraftable === true);
    }
    
    if (filters.recipesOnly) {
      items = items.filter(item => item.type === 'Recipe');
    }
    
    // Apply title filter
    if (filters.titleFilter) {
      items = items.filter(item => {
        // Check if item has title-related properties
        return (
          (item.title && item.title.toLowerCase().includes(filters.titleFilter.toLowerCase())) ||
          (item.prefix && item.prefix.toLowerCase().includes(filters.titleFilter.toLowerCase())) ||
          (item.suffix && item.suffix.toLowerCase().includes(filters.titleFilter.toLowerCase())) ||
          (item.name && item.name.toLowerCase().includes(filters.titleFilter.toLowerCase()))
        );
      });
    }
    
    console.log('📊 After applying filters, items count:', items.length);
    console.log('🔍 Sample items:', items.slice(0, 3).map(item => ({ 
      name: item.name, 
      isLegendary: item.isLegendary, 
      isCraftable: item.isCraftable 
    })));
    
    // Apply sorting
    if (filters.sortBy) {
      items.sort((a, b) => {
        let comparison = 0;
        
        switch (filters.sortBy) {
          case 'name':
            comparison = a.name.localeCompare(b.name);
            break;
          case 'level':
            const levelA = a.requirements?.Level || 0;
            const levelB = b.requirements?.Level || 0;
            comparison = levelA - levelB;
            break;
          case 'damage':
            const damageA = a.attributes?.DamageMin || 0;
            const damageB = b.attributes?.DamageMin || 0;
            comparison = damageA - damageB;
            break;
          case 'armor':
            const armorA = a.attributes?.Armor || 0;
            const armorB = b.attributes?.Armor || 0;
            comparison = armorA - armorB;
            break;
          case 'type':
            comparison = a.type.localeCompare(b.type);
            break;
          case 'strength':
            const strengthA = a.attributes?.Strength || 0;
            const strengthB = b.attributes?.Strength || 0;
            comparison = strengthA - strengthB;
            break;
          case 'dexterity':
            const dexterityA = a.attributes?.Dexterity || 0;
            const dexterityB = b.attributes?.Dexterity || 0;
            comparison = dexterityA - dexterityB;
            break;
          case 'endurance':
            const enduranceA = a.attributes?.Endurance || 0;
            const enduranceB = b.attributes?.Endurance || 0;
            comparison = enduranceA - enduranceB;
            break;
          case 'wisdom':
            const wisdomA = a.attributes?.Wisdom || 0;
            const wisdomB = b.attributes?.Wisdom || 0;
            comparison = wisdomA - wisdomB;
            break;
          case 'health':
            const healthA = a.attributes?.Health || 0;
            const healthB = b.attributes?.Health || 0;
            comparison = healthA - healthB;
            break;
          case 'mana':
            const manaA = a.attributes?.Mana || 0;
            const manaB = b.attributes?.Mana || 0;
            comparison = manaA - manaB;
            break;
          case 'stamina':
            const staminaA = a.attributes?.Stamina || 0;
            const staminaB = b.attributes?.Stamina || 0;
            comparison = staminaA - staminaB;
            break;
          case 'block':
            const blockA = a.attributes?.Block || 0;
            const blockB = b.attributes?.Block || 0;
            comparison = blockA - blockB;
            break;
          case 'title':
            const titleA = (a.title || a.prefix || a.suffix || '').toLowerCase();
            const titleB = (b.title || b.prefix || b.suffix || '').toLowerCase();
            comparison = titleA.localeCompare(titleB);
            break;
          case 'crawled_at':
            comparison = new Date(a.crawled_at) - new Date(b.crawled_at);
            break;
          default:
            comparison = 0;
        }
        
        // Apply sort order
        if (filters.sortOrder === 'desc') {
          comparison = -comparison;
        }
        
        return comparison;
      });
    }
    
    return items;
  } catch (error) {
    console.error('Error getting items:', error);
    return [];
  }
});

ipcMain.handle('get-encyclopedia-monsters', async (event, filters) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const dataDir = './encyclopedia-data';
    const monstersFile = path.join(dataDir, 'monsters.json');
    
    if (fs.existsSync(monstersFile)) {
      const monsters = JSON.parse(fs.readFileSync(monstersFile, 'utf8'));
      return monsters;
    }
    return [];
  } catch (error) {
    console.error('Error getting monsters:', error);
    return [];
  }
});

ipcMain.handle('get-encyclopedia-translations', async (event, filters) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const dataDir = './encyclopedia-data';
    const translationsFile = path.join(dataDir, 'translations.json');
    
    if (fs.existsSync(translationsFile)) {
      const translations = JSON.parse(fs.readFileSync(translationsFile, 'utf8'));
      return translations;
    }
    return [];
  } catch (error) {
    console.error('Error getting translations:', error);
    return [];
  }
});

ipcMain.handle('get-encyclopedia-titles', async (event, filters) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const dataDir = './encyclopedia-data';
    const titlesFile = path.join(dataDir, 'titles.json');
    
    if (fs.existsSync(titlesFile)) {
      const titles = JSON.parse(fs.readFileSync(titlesFile, 'utf8'));
      return titles;
    }
    return [];
  } catch (error) {
    console.error('Error getting titles:', error);
    return [];
  }
});

ipcMain.handle('search-encyclopedia', async (event, query) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const dataDir = './encyclopedia-data';
    
    const results = { items: [], monsters: [], translations: [], titles: [], total: 0 };
    
    // Search in each file
    const files = ['items.json', 'monsters.json', 'translations.json', 'titles.json'];
    files.forEach(filename => {
      const filepath = path.join(dataDir, filename);
      if (fs.existsSync(filepath)) {
        try {
          const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
          const filtered = data.filter(item => 
            item.name && item.name.toLowerCase().includes(query.toLowerCase()) ||
            (item.description && item.description.toLowerCase().includes(query.toLowerCase()))
          );
          
          switch (filename) {
            case 'items.json':
              results.items = filtered;
              break;
            case 'monsters.json':
              results.monsters = filtered;
              break;
            case 'translations.json':
              results.translations = filtered;
              break;
            case 'titles.json':
              results.titles = filtered;
              break;
          }
        } catch (error) {
          console.error(`Error reading ${filename}:`, error);
        }
      }
    });
    
    results.total = results.items.length + results.monsters.length + results.translations.length + results.titles.length;
    return results;
  } catch (error) {
    console.error('Error searching encyclopedia:', error);
    return { items: [], monsters: [], translations: [], titles: [], total: 0 };
  }
});

// Dependency Analysis Handlers
ipcMain.handle('analyze-dependencies', async (event) => {
  try {
    console.log('Starting hierarchical dependency analysis...');
    const analyzer = new DependencyAnalyzer();
    
    if (!analyzer.loadData()) {
      throw new Error('Failed to load encyclopedia data');
    }
    
    const dependencies = analyzer.analyzeDependencies();
    const stats = analyzer.getDependencyStats();
    
    console.log(`Hierarchical dependency analysis completed. Found ${stats.total_craftable_items} craftable items.`);
    
    return {
      success: true,
      stats: stats,
      total_items: stats.total_craftable_items
    };
  } catch (error) {
    console.error('Error analyzing dependencies:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('get-dependencies', async (event, itemName) => {
  try {
    console.log('🔍 get-dependencies called with itemName:', itemName);
    
    const dependenciesPath = path.join(__dirname, 'encyclopedia-data', 'dependencies.json');
    
    if (!fs.existsSync(dependenciesPath)) {
      console.log('❌ Dependencies file not found');
      return null;
    }
    
    const data = JSON.parse(fs.readFileSync(dependenciesPath, 'utf8'));
    console.log('📊 Loaded dependencies data, total records:', Object.keys(data.dependencies).length);
    
    if (itemName) {
      // Find the item by name by searching through all dependencies
      let item = null;
      console.log('🔍 Searching for item by name:', itemName);
      
      for (const [itemId, itemData] of Object.entries(data.dependencies)) {
        if (itemData.name === itemName) {
          item = itemData;
          console.log('✅ Found item:', itemData.name, 'with ID:', itemId);
          break;
        }
      }
      
      if (item) {
        console.log('🔧 Processing item dependencies for:', item.name);
        // Add recursive materials using the analyzer
        const analyzer = new DependencyAnalyzer();
        analyzer.loadData();
        analyzer.flatDependencies = data.dependencies; // Load the flat structure
        item.recursiveMaterials = analyzer.getAllMaterialsRecursive(item);
        
        console.log('📊 Item processed successfully, returning data');
        // Also return the flat dependencies for the renderer to use
        return {
          item: item,
          flatDependencies: data.dependencies
        };
      }
      
      console.log('❌ Item not found in dependencies:', itemName);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('❌ Error getting dependencies:', error);
    return null;
  }
});

ipcMain.handle('get-dependency-stats', async (event) => {
  try {
    const dependenciesPath = path.join(__dirname, 'encyclopedia-data', 'dependencies.json');
    
    if (!fs.existsSync(dependenciesPath)) {
      return null;
    }
    
    const data = JSON.parse(fs.readFileSync(dependenciesPath, 'utf8'));
    const analyzer = new DependencyAnalyzer();
    analyzer.loadData();
    
    return analyzer.getDependencyStats();
  } catch (error) {
    console.error('Error getting dependency stats:', error);
    return null;
  }
});

ipcMain.handle('search-dependencies', async (event, query) => {
  try {
    const dependenciesPath = path.join(__dirname, 'encyclopedia-data', 'dependencies.json');
    
    if (!fs.existsSync(dependenciesPath)) {
      return [];
    }
    
    const data = JSON.parse(fs.readFileSync(dependenciesPath, 'utf8'));
    const analyzer = new DependencyAnalyzer();
    analyzer.loadData();
    analyzer.dependencies = data.dependencies;
    
    return analyzer.searchDependencies(query);
  } catch (error) {
    console.error('Error searching dependencies:', error);
    return [];
  }
});

// ===== LOG VIEWER API ENDPOINTS =====

// Get available log files
ipcMain.handle('get-log-files', async () => {
  try {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      return { files: [] };
    }

    const files = fs.readdirSync(logsDir)
      .filter(file => file.endsWith('.log'))
      .map(file => {
        const filePath = path.join(logsDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          path: filePath,
          size: stats.size,
          modified: stats.mtime,
          sizeFormatted: formatFileSize(stats.size)
        };
      })
      .sort((a, b) => b.modified - a.modified);

    return { files };
  } catch (error) {
    logger.exception('Error getting log files', error);
    throw error;
  }
});

// Get logs with filtering and pagination
ipcMain.handle('get-logs', async (event, { file = 'automation.log', page = 1, limit = 100, level, search }) => {
  try {
    const logFilePath = path.join(__dirname, 'logs', file);
    
    if (!fs.existsSync(logFilePath)) {
      return { logs: [], total: 0, page: 1, totalPages: 0 };
    }

    const content = fs.readFileSync(logFilePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    
    let logs = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return null;
      }
    }).filter(log => log !== null);

    // Apply filters
    if (level) {
      logs = logs.filter(log => log.level === level.toUpperCase());
    }

    if (search) {
      const searchLower = search.toLowerCase();
      logs = logs.filter(log => 
        log.message.toLowerCase().includes(searchLower) ||
        (log.details && JSON.stringify(log.details).toLowerCase().includes(searchLower))
      );
    }

    // Pagination
    const total = logs.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedLogs = logs.slice(startIndex, endIndex);

    return {
      logs: paginatedLogs,
      total,
      page: parseInt(page),
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    };
  } catch (error) {
    logger.exception('Error getting logs', error);
    throw error;
  }
});

// Get log statistics
ipcMain.handle('get-log-stats', async (event, { file = 'automation.log' }) => {
  try {
    const logFilePath = path.join(__dirname, 'logs', file);
    
    if (!fs.existsSync(logFilePath)) {
      return {
        total: 0,
        byLevel: {},
        byFile: {},
        byFunction: {},
        timeRange: { start: null, end: null }
      };
    }

    const content = fs.readFileSync(logFilePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    
    const logs = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return null;
      }
    }).filter(log => log !== null);

    const stats = {
      total: logs.length,
      byLevel: {},
      byFile: {},
      byFunction: {},
      timeRange: { start: null, end: null }
    };

    logs.forEach(log => {
      // Count by level
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
      
      // Count by file
      stats.byFile[log.file] = (stats.byFile[log.file] || 0) + 1;
      
      // Count by function
      stats.byFunction[log.function] = (stats.byFunction[log.function] || 0) + 1;
      
      // Track time range
      const timestamp = new Date(log.timestamp);
      if (!stats.timeRange.start || timestamp < stats.timeRange.start) {
        stats.timeRange.start = timestamp;
      }
      if (!stats.timeRange.end || timestamp > stats.timeRange.end) {
        stats.timeRange.end = timestamp;
      }
    });

    return stats;
  } catch (error) {
    logger.exception('Error getting log stats', error);
    throw error;
  }
});

// Clear logs
ipcMain.handle('clear-logs', async (event, { file = 'automation.log' }) => {
  try {
    const logFilePath = path.join(__dirname, 'logs', file);
    
    if (fs.existsSync(logFilePath)) {
      fs.writeFileSync(logFilePath, '');
      logger.info(`Log file cleared: ${file}`);
    }

    return { success: true, message: `Log file ${file} cleared successfully` };
  } catch (error) {
    logger.exception('Error clearing logs', error);
    throw error;
  }
});

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
} 