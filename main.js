const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { fork } = require('child_process');
const EncyclopediaService = require('./encyclopedia-service');

let win;
let automationProcesses = {}; // { accountId: childProcess }
let automationWindows = {}; // { accountId: BrowserWindow }
let puppeteerProcesses = {};
let unscrollProcesses = {};
let encyclopediaProcesses = {}; // { accountId: childProcess }
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');

// Initialize encyclopedia service
const encyclopediaService = new EncyclopediaService();

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
  if (encyclopediaProcesses[account.id]) return false; // Already running

  const child = fork(path.join(__dirname, 'encyclopedia-crawler.js'));
  encyclopediaProcesses[account.id] = child;

  // Start a new crawl session
  const sessionId = await encyclopediaService.startCrawlSession(account.id);

  // Send credentials, session ID, and crawl options to child
  child.send({ 
    type: 'start',
    account: account, 
    sessionId: sessionId,
    crawlOptions: crawlOptions
  });

  // Listen for logs or status from child
  child.on('message', (msg) => {
    if (msg.type === 'encyclopedia-log') {
      win.webContents.send('encyclopedia-log', {
        accountId: account.id,
        log: msg.message,
        stats: msg.stats,
        sessionId: msg.sessionId
      });
    }
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

// Encyclopedia data retrieval handlers
ipcMain.handle('get-encyclopedia-stats', async () => {
  try {
    return await encyclopediaService.getCrawlStats();
  } catch (error) {
    console.error('Error getting encyclopedia stats:', error);
    return null;
  }
});

ipcMain.handle('get-encyclopedia-items', async (event, filters) => {
  try {
    return await encyclopediaService.getItems(filters);
  } catch (error) {
    console.error('Error getting items:', error);
    return [];
  }
});

ipcMain.handle('get-encyclopedia-monsters', async (event, filters) => {
  try {
    return await encyclopediaService.getMonsters(filters);
  } catch (error) {
    console.error('Error getting monsters:', error);
    return [];
  }
});

ipcMain.handle('get-encyclopedia-skills', async (event, filters) => {
  try {
    return await encyclopediaService.getSkills(filters);
  } catch (error) {
    console.error('Error getting skills:', error);
    return [];
  }
});

ipcMain.handle('get-encyclopedia-quests', async (event, filters) => {
  try {
    return await encyclopediaService.getQuests(filters);
  } catch (error) {
    console.error('Error getting quests:', error);
    return [];
  }
});

ipcMain.handle('search-encyclopedia', async (event, query) => {
  try {
    return await encyclopediaService.searchAll(query);
  } catch (error) {
    console.error('Error searching encyclopedia:', error);
    return { items: [], monsters: [], skills: [], quests: [], total: 0 };
  }
}); 