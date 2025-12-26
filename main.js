const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { fork } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const DependencyAnalyzer = require('./dependency-analyzer');
const { logger } = require('./logger');

let win;
let automationProcesses = {}; // { accountId: childProcess }
let automationWindows = {}; // { accountId: BrowserWindow }
let puppeteerProcesses = {};
let unscrollProcesses = {};
let encyclopediaProcesses = {}; // { accountId: childProcess }
const DB_PATH = path.join(__dirname, 'AutomatorDatabase.sqlite');
let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new sqlite3.Database(DB_PATH);
  }
  return dbInstance;
}

function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

async function ensureAccountsTable(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      config TEXT NOT NULL
    )`
  );
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

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS encyclopedia_dependencies (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      nodeType TEXT,
      isLegendary INTEGER,
      children TEXT,
      complexity INTEGER
    )`
  );
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_encyclopedia_dependencies_name ON encyclopedia_dependencies(name)');

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS encyclopedia_dependencies_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      generated_at TEXT,
      total_records INTEGER
    )`
  );
}

function parseJsonField(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function loadDependenciesMap(db) {
  const rows = await dbAll(db, 'SELECT * FROM encyclopedia_dependencies');
  const dependencies = {};
  rows.forEach(row => {
    dependencies[row.id] = {
      id: row.id,
      name: row.name,
      type: row.type,
      nodeType: row.nodeType,
      isLegendary: !!row.isLegendary,
      children: parseJsonField(row.children, []),
      complexity: row.complexity
    };
  });
  return dependencies;
}

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

ipcMain.handle('get-accounts', async () => {
  const db = getDb();
  await ensureAccountsTable(db);
  const rows = await dbAll(db, 'SELECT id, username, password, config FROM users ORDER BY username');
  return rows.map(row => ({
    id: row.id,
    username: row.username,
    password: row.password,
    config: row.config ? JSON.parse(row.config) : {}
  }));
});

// ===== DATABASE (SQLite) =====
ipcMain.handle('init-db', async () => {
  const db = getDb();
  await ensureAccountsTable(db);
  await ensureEncyclopediaTables(db);
  return { path: DB_PATH };
});

ipcMain.handle('get-db-schema', async () => {
  const db = getDb();
  const tables = await dbAll(
    db,
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );

  const schema = [];
  for (const table of tables) {
    const columns = await dbAll(db, `PRAGMA table_info(${quoteIdentifier(table.name)})`);
    schema.push({
      name: table.name,
      sql: table.sql,
      columns: columns.map(col => ({
        name: col.name,
        type: col.type,
        notnull: !!col.notnull,
        defaultValue: col.dflt_value,
        pk: !!col.pk
      }))
    });
  }

  return { tables: schema };
});

ipcMain.handle('get-db-table-data', async (event, { table, limit = 100, offset = 0 }) => {
  if (!table) return { rows: [] };
  const db = getDb();
  const tableRows = await dbAll(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name = ?",
    [table]
  );
  if (tableRows.length === 0) {
    throw new Error(`Table not found: ${table}`);
  }
  const rows = await dbAll(
    db,
    `SELECT * FROM ${quoteIdentifier(table)} LIMIT ? OFFSET ?`,
    [Number(limit) || 100, Number(offset) || 0]
  );
  return { rows };
});

ipcMain.handle('execute-db-query', async (event, { query }) => {
  const db = getDb();
  const sql = (query || '').trim();
  if (!sql) {
    return { type: 'error', error: 'Query is empty' };
  }
  const isSelect = /^(select|pragma|with)\b/i.test(sql);
  if (isSelect) {
    const rows = await dbAll(db, sql);
    return { type: 'rows', rows };
  }
  const result = await dbRun(db, sql);
  return { type: 'run', changes: result.changes, lastID: result.lastID };
});

ipcMain.handle('save-accounts', async (event, accounts) => {
  const db = getDb();
  await ensureAccountsTable(db);
  await dbRun(db, 'BEGIN TRANSACTION');
  try {
    await dbRun(db, 'DELETE FROM users');
    for (const acc of accounts || []) {
      const configJson = JSON.stringify(acc.config || {});
      await dbRun(
        db,
        'INSERT INTO users (id, username, password, config) VALUES (?, ?, ?, ?)',
        [acc.id, acc.username, acc.password, configJson]
      );
    }
    await dbRun(db, 'COMMIT');
  } catch (error) {
    await dbRun(db, 'ROLLBACK');
    throw error;
  }
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
  let account = null;
  try {
    const db = getDb();
    await ensureAccountsTable(db);
    const rows = await dbAll(
      db,
      'SELECT id, username, password, config FROM users WHERE id = ? LIMIT 1',
      [accountId]
    );
    account = rows[0] || null;
  } catch (error) {
    console.error('Error loading accounts:', error);
    return false;
  }
  
  if (!account) return false;
  
  // Kill the Chrome process for this specific account
  const { exec } = require('child_process');
  const os = require('os');
  
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
    const db = getDb();
    await ensureEncyclopediaTables(db);

    const summaryRows = await dbAll(
      db,
      'SELECT crawl_date, total_items, total_monsters, total_translations, total_quests, files FROM encyclopedia_summary WHERE id = 1'
    );
    if (summaryRows.length > 0) {
      const summary = summaryRows[0];
      return {
        crawl_date: summary.crawl_date,
        total_items: summary.total_items || 0,
        total_monsters: summary.total_monsters || 0,
        total_translations: summary.total_translations || 0,
        total_quests: summary.total_quests || 0,
        files: parseJsonField(summary.files, [])
      };
    }

    const [itemsCount] = await dbAll(db, 'SELECT COUNT(*) AS count FROM encyclopedia_items');
    const [monstersCount] = await dbAll(db, 'SELECT COUNT(*) AS count FROM encyclopedia_monsters');
    const [translationsCount] = await dbAll(db, 'SELECT COUNT(*) AS count FROM encyclopedia_translations');
    const [titlesCount] = await dbAll(db, 'SELECT COUNT(*) AS count FROM encyclopedia_titles');
    return {
      total_items: itemsCount?.count || 0,
      total_monsters: monstersCount?.count || 0,
      total_translations: translationsCount?.count || 0,
      total_titles: titlesCount?.count || 0
    };
  } catch (error) {
    console.error('Error getting encyclopedia stats:', error);
    return { total_items: 0, total_monsters: 0, total_translations: 0, total_titles: 0 };
  }
});

ipcMain.handle('get-encyclopedia-items', async (event, filters = {}) => {
  try {
    console.log('🔍 get-encyclopedia-items called with filters:', filters);
    const db = getDb();
    await ensureEncyclopediaTables(db);
    const rows = await dbAll(db, 'SELECT * FROM encyclopedia_items');
    let items = rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      isLegendary: !!row.isLegendary,
      isDrop: !!row.isDrop,
      isCraftable: !!row.isCraftable,
      description: row.description || '',
      plainAttributes: parseJsonField(row.plainAttributes, []),
      plainReq: parseJsonField(row.plainReq, []),
      attributes: parseJsonField(row.attributes, {}),
      requirements: parseJsonField(row.requirements, {}),
      ingredients: parseJsonField(row.ingredients, []),
      image_url: row.image_url || '',
      source: row.source || '',
      crawled_at: row.crawled_at || ''
    }));
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
    const db = getDb();
    await ensureEncyclopediaTables(db);
    const rows = await dbAll(db, 'SELECT * FROM encyclopedia_monsters');
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      level: row.level,
      hp: row.hp,
      attack: row.attack,
      defense: row.defense,
      location: row.location,
      image_url: row.image_url,
      source: row.source,
      crawled_at: row.crawled_at
    }));
  } catch (error) {
    console.error('Error getting monsters:', error);
    return [];
  }
});

ipcMain.handle('get-encyclopedia-translations', async (event, filters) => {
  try {
    const db = getDb();
    await ensureEncyclopediaTables(db);
    const rows = await dbAll(db, 'SELECT * FROM encyclopedia_translations');
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      originalText: row.originalText,
      translatedText: row.translatedText,
      url: row.url,
      source: row.source,
      crawled_at: row.crawled_at
    }));
  } catch (error) {
    console.error('Error getting translations:', error);
    return [];
  }
});

ipcMain.handle('get-encyclopedia-titles', async (event, filters) => {
  try {
    const db = getDb();
    await ensureEncyclopediaTables(db);
    const rows = await dbAll(db, 'SELECT * FROM encyclopedia_titles');
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      plainAttributes: parseJsonField(row.plainAttributes, []),
      plainReq: parseJsonField(row.plainReq, []),
      available: row.available,
      slots: parseJsonField(row.slots, {}),
      attributes: parseJsonField(row.attributes, {}),
      requirements: parseJsonField(row.requirements, {}),
      prefix: row.prefix,
      suffix: row.suffix,
      source: row.source,
      crawled_at: row.crawled_at
    }));
  } catch (error) {
    console.error('Error getting titles:', error);
    return [];
  }
});

ipcMain.handle('search-encyclopedia', async (event, query) => {
  try {
    const db = getDb();
    await ensureEncyclopediaTables(db);
    const results = { items: [], monsters: [], translations: [], titles: [], total: 0 };
    
    const like = `%${query}%`;
    const items = await dbAll(
      db,
      'SELECT * FROM encyclopedia_items WHERE name LIKE ? OR description LIKE ?',
      [like, like]
    );
    results.items = items.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      isLegendary: !!row.isLegendary,
      isDrop: !!row.isDrop,
      isCraftable: !!row.isCraftable,
      description: row.description || '',
      plainAttributes: parseJsonField(row.plainAttributes, []),
      plainReq: parseJsonField(row.plainReq, []),
      attributes: parseJsonField(row.attributes, {}),
      requirements: parseJsonField(row.requirements, {}),
      ingredients: parseJsonField(row.ingredients, []),
      image_url: row.image_url || '',
      source: row.source || '',
      crawled_at: row.crawled_at || ''
    }));

    const monsters = await dbAll(
      db,
      'SELECT * FROM encyclopedia_monsters WHERE name LIKE ? OR location LIKE ?',
      [like, like]
    );
    results.monsters = monsters.map(row => ({
      id: row.id,
      name: row.name,
      level: row.level,
      hp: row.hp,
      attack: row.attack,
      defense: row.defense,
      location: row.location,
      image_url: row.image_url,
      source: row.source,
      crawled_at: row.crawled_at
    }));

    const translations = await dbAll(
      db,
      'SELECT * FROM encyclopedia_translations WHERE name LIKE ? OR originalText LIKE ? OR translatedText LIKE ?',
      [like, like, like]
    );
    results.translations = translations.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      originalText: row.originalText,
      translatedText: row.translatedText,
      url: row.url,
      source: row.source,
      crawled_at: row.crawled_at
    }));

    const titles = await dbAll(
      db,
      'SELECT * FROM encyclopedia_titles WHERE name LIKE ? OR prefix LIKE ? OR suffix LIKE ?',
      [like, like, like]
    );
    results.titles = titles.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      plainAttributes: parseJsonField(row.plainAttributes, []),
      plainReq: parseJsonField(row.plainReq, []),
      available: row.available,
      slots: parseJsonField(row.slots, {}),
      attributes: parseJsonField(row.attributes, {}),
      requirements: parseJsonField(row.requirements, {}),
      prefix: row.prefix,
      suffix: row.suffix,
      source: row.source,
      crawled_at: row.crawled_at
    }));
    
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

    const db = getDb();
    await ensureEncyclopediaTables(db);
    await dbRun(db, 'BEGIN TRANSACTION');
    try {
      await dbRun(db, 'DELETE FROM encyclopedia_dependencies');
      const entries = Object.values(dependencies);
      for (const record of entries) {
        await dbRun(
          db,
          `INSERT INTO encyclopedia_dependencies
            (id, name, type, nodeType, isLegendary, children, complexity)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            record.id,
            record.name,
            record.type,
            record.nodeType,
            record.isLegendary ? 1 : 0,
            JSON.stringify(record.children || []),
            record.complexity
          ]
        );
      }
      await dbRun(
        db,
        `INSERT INTO encyclopedia_dependencies_meta (id, generated_at, total_records)
         VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET generated_at = excluded.generated_at, total_records = excluded.total_records`,
        [new Date().toISOString(), entries.length]
      );
      await dbRun(db, 'COMMIT');
    } catch (dbError) {
      await dbRun(db, 'ROLLBACK');
      throw dbError;
    }
    
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

    const db = getDb();
    await ensureEncyclopediaTables(db);
    const dependencies = await loadDependenciesMap(db);
    console.log('📊 Loaded dependencies data, total records:', Object.keys(dependencies).length);
    
    if (itemName) {
      // Find the item by name by searching through all dependencies
      let item = null;
      console.log('🔍 Searching for item by name:', itemName);
      
      for (const [itemId, itemData] of Object.entries(dependencies)) {
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
        analyzer.flatDependencies = dependencies; // Load the flat structure
        item.recursiveMaterials = analyzer.getAllMaterialsRecursive(item);
        
        console.log('📊 Item processed successfully, returning data');
        // Also return the flat dependencies for the renderer to use
        return {
          item: item,
          flatDependencies: dependencies
        };
      }
      
      console.log('❌ Item not found in dependencies:', itemName);
      return null;
    }
    
    return {
      generated_at: null,
      total_records: Object.keys(dependencies).length,
      dependencies
    };
  } catch (error) {
    console.error('❌ Error getting dependencies:', error);
    return null;
  }
});

ipcMain.handle('get-dependency-stats', async (event) => {
  try {
    const db = getDb();
    await ensureEncyclopediaTables(db);
    const dependencies = await loadDependenciesMap(db);
    if (Object.keys(dependencies).length === 0) {
      return null;
    }
    const analyzer = new DependencyAnalyzer();
    analyzer.loadData();
    analyzer.flatDependencies = dependencies;
    return analyzer.getDependencyStats();
  } catch (error) {
    console.error('Error getting dependency stats:', error);
    return null;
  }
});

ipcMain.handle('search-dependencies', async (event, query) => {
  try {
    const db = getDb();
    await ensureEncyclopediaTables(db);
    const dependencies = await loadDependenciesMap(db);
    const analyzer = new DependencyAnalyzer();
    analyzer.loadData();
    analyzer.flatDependencies = dependencies;
    
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
