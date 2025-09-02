const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { fork } = require('child_process');
const DependencyAnalyzer = require('./dependency-analyzer');
const { logger } = require('./logger');
const XLSX = require('xlsx');

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
      let translations = JSON.parse(fs.readFileSync(translationsFile, 'utf8'));
      
      // Apply filters if provided
      if (filters) {
        if (filters.search) {
          const searchTerm = filters.search.toLowerCase();
          translations = translations.filter(translation => 
            translation.name.toLowerCase().includes(searchTerm) ||
            translation.originalText.toLowerCase().includes(searchTerm) ||
            translation.translatedText.toLowerCase().includes(searchTerm)
          );
        }
        
        if (filters.sortBy) {
          translations.sort((a, b) => {
            let comparison = 0;
            switch (filters.sortBy) {
              case 'name':
                comparison = a.name.localeCompare(b.name);
                break;
              case 'originalText':
                comparison = a.originalText.localeCompare(b.originalText);
                break;
              case 'translatedText':
                comparison = a.translatedText.localeCompare(b.translatedText);
                break;
              case 'crawled_at':
                comparison = new Date(a.crawled_at) - new Date(b.crawled_at);
                break;
              default:
                comparison = 0;
            }
            return filters.sortOrder === 'desc' ? -comparison : comparison;
          });
        }
      }
      
      return translations;
    }
    return [];
  } catch (error) {
    console.error('Error getting translations:', error);
    return [];
  }
});

// Get single translation by ID
ipcMain.handle('get-translation-details', async (event, translationId) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const dataDir = './encyclopedia-data';
    const translationsFile = path.join(dataDir, 'translations.json');
    
    if (fs.existsSync(translationsFile)) {
      const translations = JSON.parse(fs.readFileSync(translationsFile, 'utf8'));
      const translation = translations.find(t => t.id === translationId);
      return translation || null;
    }
    return null;
  } catch (error) {
    console.error('Error getting translation details:', error);
    return null;
  }
});

// Save translation update
ipcMain.handle('save-translation', async (event, translationData) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const dataDir = './encyclopedia-data';
    const translationsFile = path.join(dataDir, 'translations.json');
    
    if (fs.existsSync(translationsFile)) {
      const translations = JSON.parse(fs.readFileSync(translationsFile, 'utf8'));
      const index = translations.findIndex(t => t.id === translationData.id);
      
      if (index !== -1) {
        translations[index] = {
          ...translations[index],
          ...translationData,
          updated_at: new Date().toISOString()
        };
        
        fs.writeFileSync(translationsFile, JSON.stringify(translations, null, 2));
        return { success: true, translation: translations[index] };
      }
    }
    return { success: false, error: 'Translation not found' };
  } catch (error) {
    console.error('Error saving translation:', error);
    return { success: false, error: error.message };
  }
});

// Export translations to Excel
ipcMain.handle('export-translations-to-excel', async (event, filters) => {
  try {
    logger.info('Starting Excel export for translations', { filters });
    
    const fs = require('fs');
    const path = require('path');
    const dataDir = './encyclopedia-data';
    const translationsFile = path.join(dataDir, 'translations.json');
    
    if (!fs.existsSync(translationsFile)) {
      return { success: false, error: 'Translations file not found' };
    }
    
    let translations = JSON.parse(fs.readFileSync(translationsFile, 'utf8'));
    
    // Apply filters if provided (same logic as get-encyclopedia-translations)
    if (filters) {
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        translations = translations.filter(translation => 
          translation.name.toLowerCase().includes(searchTerm) ||
          translation.originalText.toLowerCase().includes(searchTerm) ||
          translation.translatedText.toLowerCase().includes(searchTerm)
        );
      }
      
      if (filters.sortBy) {
        translations.sort((a, b) => {
          let comparison = 0;
          switch (filters.sortBy) {
            case 'name':
              comparison = a.name.localeCompare(b.name);
              break;
            case 'originalText':
              comparison = a.originalText.localeCompare(b.originalText);
              break;
            case 'translatedText':
              comparison = a.translatedText.localeCompare(b.translatedText);
              break;
            case 'crawled_at':
              comparison = new Date(a.crawled_at) - new Date(b.crawled_at);
              break;
            default:
              comparison = a.name.localeCompare(b.name);
          }
          return filters.sortOrder === 'desc' ? -comparison : comparison;
        });
      }
    }
    
    // Prepare data for Excel
    const excelData = translations.map(translation => ({
      'ID': translation.id,
      'Name': translation.name,
      'Type': translation.type || 'Translation',
      'Original Text': translation.originalText,
      'Translated Text': translation.translatedText,
      'Date Added': translation.crawled_at ? new Date(translation.crawled_at).toLocaleDateString() : '',
      'Last Updated': translation.updated_at ? new Date(translation.updated_at).toLocaleDateString() : '',
      'Status': translation.translatedText ? 'Translated' : 'Pending'
    }));
    
    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    
    // Set column widths
    const columnWidths = [
      { wch: 15 }, // ID
      { wch: 25 }, // Name
      { wch: 15 }, // Type
      { wch: 40 }, // Original Text
      { wch: 40 }, // Translated Text
      { wch: 12 }, // Date Added
      { wch: 12 }, // Last Updated
      { wch: 12 }  // Status
    ];
    worksheet['!cols'] = columnWidths;
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Translations');
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `translations_export_${timestamp}.xlsx`;
    const filepath = path.join(process.cwd(), filename);
    
    // Write Excel file
    XLSX.writeFile(workbook, filepath);
    
    logger.info('Excel export completed successfully', { 
      filename, 
      recordCount: translations.length,
      filepath 
    });
    
    return { 
      success: true, 
      filename, 
      filepath,
      recordCount: translations.length 
    };
    
  } catch (error) {
    logger.exception('Excel export failed', error);
    return { success: false, error: error.message };
  }
});

// Upload and process Excel file for translations
ipcMain.handle('upload-excel-translations', async (event, filePath) => {
  try {
    logger.info('Starting Excel upload processing', { filePath });
    
    const fs = require('fs');
    const path = require('path');
    const dataDir = './encyclopedia-data';
    const translationsFile = path.join(dataDir, 'translations.json');
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Excel file not found' };
    }
    
    // Read and parse Excel file
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0]; // Use first sheet
    const worksheet = workbook.Sheets[sheetName];
    const excelData = XLSX.utils.sheet_to_json(worksheet);
    
    logger.info('Excel file parsed successfully', { 
      sheetName, 
      recordCount: excelData.length 
    });
    
    // Validate Excel structure
    if (excelData.length === 0) {
      return { success: false, error: 'Excel file is empty or has no data' };
    }
    
    // Check required columns
    const requiredColumns = ['ID', 'Name', 'Original Text', 'Translated Text'];
    const firstRow = excelData[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));
    
    if (missingColumns.length > 0) {
      return { 
        success: false, 
        error: `Missing required columns: ${missingColumns.join(', ')}` 
      };
    }
    
    // Load current translations
    let currentTranslations = [];
    if (fs.existsSync(translationsFile)) {
      currentTranslations = JSON.parse(fs.readFileSync(translationsFile, 'utf8'));
    }
    
    // Create a map of current translations for quick lookup
    const currentTranslationMap = new Map();
    currentTranslations.forEach(translation => {
      currentTranslationMap.set(translation.id, translation);
    });
    
    // Process Excel data
    const updateStats = {
      updated: 0,
      added: 0,
      skipped: 0,
      errors: 0
    };
    
    const processedTranslations = [...currentTranslations];
    
    excelData.forEach((row, index) => {
      try {
        const id = row['ID'];
        const name = row['Name'];
        const originalText = row['Original Text'];
        const translatedText = row['Translated Text'];
        const type = row['Type'] || 'Translation';
        
        // Skip rows with missing essential data
        if (!id || !name || !originalText) {
          updateStats.skipped++;
          logger.warn(`Skipping row ${index + 1}: missing essential data`, { id, name, originalText });
          return;
        }
        
        // Check if translation exists
        const existingTranslation = currentTranslationMap.get(id);
        
        if (existingTranslation) {
          // Update existing translation
          const updatedTranslation = {
            ...existingTranslation,
            name: name,
            originalText: originalText,
            translatedText: translatedText || '',
            type: type,
            updated_at: new Date().toISOString()
          };
          
          // Find and update in processed array
          const existingIndex = processedTranslations.findIndex(t => t.id === id);
          if (existingIndex !== -1) {
            processedTranslations[existingIndex] = updatedTranslation;
            updateStats.updated++;
            logger.info(`Updated translation: ${id}`, { 
              oldTranslatedText: existingTranslation.translatedText,
              newTranslatedText: translatedText 
            });
          }
        } else {
          // Add new translation
          const newTranslation = {
            id: id,
            name: name,
            originalText: originalText,
            translatedText: translatedText || '',
            type: type,
            crawled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          processedTranslations.push(newTranslation);
          updateStats.added++;
          logger.info(`Added new translation: ${id}`, { name, originalText, translatedText });
        }
        
      } catch (error) {
        updateStats.errors++;
        logger.error(`Error processing row ${index + 1}`, error);
      }
    });
    
    // Save updated translations
    fs.writeFileSync(translationsFile, JSON.stringify(processedTranslations, null, 2));
    
    logger.info('Excel upload processing completed successfully', {
      totalProcessed: excelData.length,
      updateStats,
      finalCount: processedTranslations.length
    });
    
    return {
      success: true,
      stats: updateStats,
      totalProcessed: excelData.length,
      finalCount: processedTranslations.length
    };
    
  } catch (error) {
    logger.exception('Excel upload processing failed', error);
    return { success: false, error: error.message };
  }
});

// Get context settings
ipcMain.handle('get-context-settings', async (event) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const contextFile = path.join(process.cwd(), 'context-settings.json');
    
    if (fs.existsSync(contextFile)) {
      const contextData = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
      return { success: true, settings: contextData };
    }
    
    // Return default settings
    const defaultSettings = {
      generalContext: 'This is a fantasy RPG game with magical elements, medieval themes, and epic adventures.',
      additionalRequirements: [
        'Use appropriate fantasy terminology',
        'Maintain consistency with game lore',
        'Keep translations concise and impactful',
        'Use proper Vietnamese grammar and spelling'
      ],
      translationPreferences: {
        nameStyle: 'chinese_style',
        itemStyle: 'chinese_style',
        monsterStyle: 'chinese_style',
        locationStyle: 'chinese_style',
        skillStyle: 'chinese_style',
        defaultStyle: 'standard'
      }
    };
    
    return { success: true, settings: defaultSettings };
    
  } catch (error) {
    logger.exception('Error getting context settings', error);
    return { success: false, error: error.message };
  }
});

// Save context settings
ipcMain.handle('save-context-settings', async (event, settings) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const contextFile = path.join(process.cwd(), 'context-settings.json');
    
    fs.writeFileSync(contextFile, JSON.stringify(settings, null, 2));
    
    logger.info('Context settings saved successfully', { settings });
    
    return { success: true };
    
  } catch (error) {
    logger.exception('Error saving context settings', error);
    return { success: false, error: error.message };
  }
});

// Get AI translation suggestion
ipcMain.handle('get-ai-translation-suggestion', async (event, originalText, context = {}) => {
  try {
    console.log(`🤖 Getting AI translation for: "${originalText}" with context:`, context);
    
    // Load custom context settings
    let customContext = null;
    try {
      const fs = require('fs');
      const path = require('path');
      const contextFile = path.join(process.cwd(), 'context-settings.json');
      
      if (fs.existsSync(contextFile)) {
        customContext = JSON.parse(fs.readFileSync(contextFile, 'utf8'));
      }
    } catch (error) {
      console.log('No custom context settings found, using defaults');
    }
    
    // Determine translation style based on context
    const translationStyle = determineTranslationStyle(originalText, context, customContext);
    console.log(`🎨 Translation style determined: ${translationStyle}`);
    
    // Generate multiple suggestions with custom context
    const suggestions = await generateMultipleSuggestions(originalText, translationStyle, customContext);
    
    if (suggestions.length > 0) {
      console.log(`✅ Generated ${suggestions.length} translation suggestions`);
      return {
        success: true,
        suggestions: suggestions,
        style: translationStyle
      };
    }
    
    // If all services fail, return error
    return { 
      success: false, 
      error: 'All translation services are currently unavailable' 
    };
    
  } catch (error) {
    console.error('Error getting AI translation suggestion:', error);
    return { success: false, error: error.message };
  }
});

// Generate multiple translation suggestions
async function generateMultipleSuggestions(text, style, customContext = null) {
  const suggestions = [];
  
  // Try different services and styles to get variety
  const translationVariants = [
    { service: 'LibreTranslate', style: style, priority: 1 },
    { service: 'MyMemory', style: style, priority: 2 },
    { service: 'Enhanced Dictionary', style: style, priority: 3 },
    { service: 'Enhanced Dictionary', style: 'chinese_style', priority: 4 },
    { service: 'Enhanced Dictionary', style: 'standard', priority: 5 }
  ];
  
  for (const variant of translationVariants) {
    try {
      let result;
      
      if (variant.service === 'LibreTranslate') {
        result = await translateWithLibreTranslate(text, 'https://libretranslate.de/translate', variant.style);
      } else if (variant.service === 'MyMemory') {
        result = await translateWithMyMemory(text, 'https://api.mymemory.translated.net/get', variant.style);
      } else {
        result = await translateWithEnhancedDictionary(text, variant.style);
      }
      
      if (result.success) {
        // Check if this suggestion is unique
        const isUnique = !suggestions.some(s => s.suggestion === result.suggestion);
        if (isUnique) {
          suggestions.push({
            suggestion: result.suggestion,
            service: result.service,
            style: result.style,
            confidence: result.confidence,
            priority: variant.priority
          });
        }
      }
    } catch (error) {
      console.log(`❌ ${variant.service} failed:`, error.message);
      continue;
    }
    
    // Stop when we have 5 suggestions
    if (suggestions.length >= 5) break;
  }
  
  // Sort by priority and confidence
  suggestions.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.confidence - a.confidence;
  });
  
  // Ensure we have at least 3 suggestions
  if (suggestions.length < 3) {
    // Add some fallback suggestions
    const fallbackSuggestions = generateFallbackSuggestions(text, style);
    suggestions.push(...fallbackSuggestions);
  }
  
  return suggestions.slice(0, 5); // Return max 5 suggestions
}

// Generate fallback suggestions when services fail
function generateFallbackSuggestions(text, style) {
  const fallbacks = [];
  
  // Basic Vietnamese translation
  const basicTranslation = translateBasicVietnamese(text);
  if (basicTranslation) {
    fallbacks.push({
      suggestion: basicTranslation,
      service: 'Basic Vietnamese',
      style: 'standard',
      confidence: 0.60,
      priority: 6
    });
  }
  
  // Chinese-style translation
  if (style === 'chinese_style' || isProperNoun(text)) {
    const chineseTranslation = applyChineseStyle(text);
    if (chineseTranslation && chineseTranslation !== text) {
      fallbacks.push({
        suggestion: chineseTranslation,
        service: 'Chinese Style',
        style: 'chinese_style',
        confidence: 0.70,
        priority: 7
      });
    }
  }
  
  // Literal translation
  const literalTranslation = translateLiteral(text);
  if (literalTranslation && literalTranslation !== text) {
    fallbacks.push({
      suggestion: literalTranslation,
      service: 'Literal Translation',
      style: 'literal',
      confidence: 0.50,
      priority: 8
    });
  }
  
  return fallbacks;
}

// Basic Vietnamese translation
function translateBasicVietnamese(text) {
  const basicDict = {
    'select': 'chọn',
    'gear': 'trang bị',
    'equipment': 'trang bị',
    'weapon': 'vũ khí',
    'armor': 'áo giáp',
    'helmet': 'mũ',
    'shield': 'khiên',
    'sword': 'kiếm',
    'bow': 'cung',
    'staff': 'gậy',
    'ring': 'nhẫn',
    'necklace': 'dây chuyền',
    'bracelet': 'vòng tay',
    'boots': 'giày',
    'gloves': 'găng tay',
    'belt': 'thắt lưng',
    'dragon': 'rồng',
    'Dragon': 'Rồng',
    'DRAGON': 'RỒNG',
    'fire': 'lửa',
    'water': 'nước',
    'earth': 'đất',
    'wind': 'gió',
    'ice': 'băng',
    'light': 'ánh sáng',
    'dark': 'bóng tối',
    'black': 'đen',
    'Black': 'Đen',
    'BLACK': 'ĐEN',
    'magic': 'phép thuật',
    'power': 'sức mạnh',
    'strength': 'sức mạnh',
    'wisdom': 'trí tuệ',
    'health': 'sức khỏe',
    'mana': 'năng lượng phép thuật',
    'stamina': 'thể lực'
  };
  
  const words = text.toLowerCase().split(/\s+/);
  const translatedWords = words.map(word => {
    const cleanWord = word.replace(/[^\w]/g, '');
    return basicDict[cleanWord] || word;
  });
  
  let result = translatedWords.join(' ');
  result = result.charAt(0).toUpperCase() + result.slice(1);
  
  return result !== text ? result : null;
}

// Literal translation
function translateLiteral(text) {
  // Simple word-by-word translation
  const literalDict = {
    'the': 'cái',
    'a': 'một',
    'an': 'một',
    'of': 'của',
    'and': 'và',
    'or': 'hoặc',
    'with': 'với',
    'from': 'từ',
    'to': 'đến',
    'in': 'trong',
    'on': 'trên',
    'at': 'tại',
    'by': 'bởi',
    'for': 'cho',
    'is': 'là',
    'are': 'là',
    'was': 'đã là',
    'were': 'đã là',
    'will': 'sẽ',
    'can': 'có thể',
    'should': 'nên',
    'must': 'phải',
    'may': 'có thể',
    'might': 'có thể'
  };
  
  const words = text.toLowerCase().split(/\s+/);
  const translatedWords = words.map(word => {
    const cleanWord = word.replace(/[^\w]/g, '');
    return literalDict[cleanWord] || word;
  });
  
  let result = translatedWords.join(' ');
  result = result.charAt(0).toUpperCase() + result.slice(1);
  
  return result !== text ? result : null;
}

// Check if text contains placeholders that shouldn't be translated
function containsPlaceholders(text) {
  // Check for common placeholder patterns
  const placeholderPatterns = [
    /%[^%]*%/,           // %something% or %%
    /\{[^}]*\}/,         // {something}
    /\[[^\]]*\]/,        // [something]
    /<[^>]*>/,           // <something>
    /#\d+/,              // #1, #2, etc.
    /\(\d+\)/,           // (1), (2), etc.
    /% of/,              // % of something
    /% \(/,              // % (something)
    /%$/,                // ends with %
    /^%/,                // starts with %
    /% [IVX]+\)/,        // % (IV), % (VI), etc.
    /% \([IVX]+\)/       // % (IV), % (VI), etc.
  ];
  
  return placeholderPatterns.some(pattern => pattern.test(text));
}

// Determine translation style based on context
function determineTranslationStyle(text, context, customContext = null) {
  const lowerText = text.toLowerCase();
  
  // Check if text contains placeholders that shouldn't be translated
  if (containsPlaceholders(text)) {
    return 'placeholder';
  }
  
  // Use custom context preferences if available
  if (customContext && customContext.translationPreferences) {
    const prefs = customContext.translationPreferences;
    
    // Check if it's a name (proper noun)
    if (isProperNoun(text)) {
      return prefs.nameStyle || 'chinese_style';
    }
    
    // Check if it's a game item/equipment
    if (isGameItem(text, context)) {
      return prefs.itemStyle || 'chinese_style';
    }
    
    // Check if it's a monster/creature
    if (isMonster(text, context)) {
      return prefs.monsterStyle || 'chinese_style';
    }
    
    // Check if it's a location
    if (isLocation(text, context)) {
      return prefs.locationStyle || 'chinese_style';
    }
    
    // Check if it's a skill/spell
    if (isSkill(text, context)) {
      return prefs.skillStyle || 'chinese_style';
    }
    
    // Use default style from preferences
    return prefs.defaultStyle || 'standard';
  }
  
  // Fallback to original logic if no custom context
  // Check if it's a name (proper noun)
  if (isProperNoun(text)) {
    return 'chinese_style'; // Chinese-like translation for names
  }
  
  // Check if it's a game item/equipment
  if (isGameItem(text, context)) {
    return 'game_item';
  }
  
  // Check if it's a monster/creature
  if (isMonster(text, context)) {
    return 'monster';
  }
  
  // Check if it's a location
  if (isLocation(text, context)) {
    return 'location';
  }
  
  // Check if it's a skill/spell
  if (isSkill(text, context)) {
    return 'skill';
  }
  
  // Default to standard Vietnamese
  return 'standard';
}

// Check if text is a proper noun (name)
function isProperNoun(text) {
  // Names are usually capitalized, short, and don't contain common words
  const commonWords = ['the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by'];
  const words = text.split(' ');
  
  // If it's a single word and capitalized, likely a name
  if (words.length === 1 && text[0] === text[0].toUpperCase()) {
    return true;
  }
  
  // If it contains mostly capitalized words and no common words, likely a name
  const capitalizedWords = words.filter(word => word[0] === word[0].toUpperCase());
  const hasCommonWords = words.some(word => commonWords.includes(word.toLowerCase()));
  
  return capitalizedWords.length >= words.length * 0.7 && !hasCommonWords;
}

// Check if text is a game item
function isGameItem(text, context) {
  const itemKeywords = ['sword', 'armor', 'helmet', 'shield', 'bow', 'staff', 'ring', 'necklace', 'bracelet', 'boots', 'gloves', 'belt', 'weapon', 'equipment', 'gear'];
  return itemKeywords.some(keyword => text.toLowerCase().includes(keyword));
}

// Check if text is a monster
function isMonster(text, context) {
  const monsterKeywords = ['dragon', 'goblin', 'orc', 'troll', 'skeleton', 'zombie', 'ghost', 'demon', 'angel', 'beast', 'monster', 'creature'];
  return monsterKeywords.some(keyword => text.toLowerCase().includes(keyword));
}

// Check if text is a location
function isLocation(text, context) {
  const locationKeywords = ['dungeon', 'cave', 'forest', 'mountain', 'castle', 'village', 'city', 'tower', 'temple', 'ruins', 'palace', 'kingdom'];
  return locationKeywords.some(keyword => text.toLowerCase().includes(keyword));
}

// Check if text is a skill
function isSkill(text, context) {
  const skillKeywords = ['spell', 'magic', 'skill', 'ability', 'power', 'attack', 'defense', 'heal', 'cure', 'buff', 'debuff'];
  return skillKeywords.some(keyword => text.toLowerCase().includes(keyword));
}

// LibreTranslate API (completely free and open-source)
async function translateWithLibreTranslate(text, apiUrl, style = 'standard') {
  // Handle placeholder style - don't translate
  if (style === 'placeholder') {
    return {
      success: true,
      suggestion: text, // Return original text unchanged
      confidence: 1.0,
      service: 'Placeholder Protection',
      style: style
    };
  }
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: text,
      source: 'en',
      target: 'vi',
      format: 'text'
    })
  });
  
  if (!response.ok) {
    throw new Error(`LibreTranslate API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.translatedText) {
    let finalTranslation = data.translatedText;
    
    // Post-process based on style
    if (style === 'chinese_style') {
      finalTranslation = applyChineseStyle(finalTranslation);
    }
    
    return {
      success: true,
      suggestion: finalTranslation,
      confidence: 0.85,
      service: 'LibreTranslate',
      style: style
    };
  }
  
  throw new Error('No translation received from LibreTranslate');
}

// MyMemory API (free tier available)
async function translateWithMyMemory(text, apiUrl, style = 'standard') {
  // Handle placeholder style - don't translate
  if (style === 'placeholder') {
    return {
      success: true,
      suggestion: text, // Return original text unchanged
      confidence: 1.0,
      service: 'Placeholder Protection',
      style: style
    };
  }
  
  const params = new URLSearchParams({
    q: text,
    langpair: 'en|vi'
  });
  
  const response = await fetch(`${apiUrl}?${params}`);
  
  if (!response.ok) {
    throw new Error(`MyMemory API error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
    let finalTranslation = data.responseData.translatedText;
    
    // Post-process based on style
    if (style === 'chinese_style') {
      finalTranslation = applyChineseStyle(finalTranslation);
    }
    
    return {
      success: true,
      suggestion: finalTranslation,
      confidence: 0.80,
      service: 'MyMemory',
      style: style
    };
  }
  
  throw new Error('No translation received from MyMemory');
}

// Get context prompt for translation style
function getContextPrompt(style, customContext = null) {
  let basePrompt = '';
  
  // Add custom general context if available
  if (customContext && customContext.generalContext) {
    basePrompt = `${customContext.generalContext}\n\n`;
  }
  
  // Add custom additional requirements if available
  if (customContext && customContext.additionalRequirements && customContext.additionalRequirements.length > 0) {
    basePrompt += `Additional requirements:\n${customContext.additionalRequirements.map(req => `- ${req}`).join('\n')}\n\n`;
  }
  
  const contextPrompts = {
    'chinese_style': `${basePrompt}Translate this name in a Chinese-style Vietnamese translation, using Sino-Vietnamese characters where appropriate:`,
    'game_item': `${basePrompt}Translate this game item name to Vietnamese, keeping it concise and game-appropriate:`,
    'monster': `${basePrompt}Translate this monster/creature name to Vietnamese, making it sound intimidating:`,
    'location': `${basePrompt}Translate this location name to Vietnamese, making it sound mystical or epic:`,
    'skill': `${basePrompt}Translate this skill/spell name to Vietnamese, making it sound powerful:`,
    'placeholder': 'DO NOT TRANSLATE - This contains placeholders that must remain unchanged:',
    'standard': basePrompt || null
  };
  
  return contextPrompts[style] || null;
}

// Apply Chinese-style translation
function applyChineseStyle(translation) {
  // Chinese-style name translations using Sino-Vietnamese characters
  const chineseStyleDict = {
    // Common name patterns
    'dragon': 'Rồng', // 龍
    'Dragon': 'Rồng', // 龍
    'DRAGON': 'RỒNG', // 龍
    'phoenix': 'Phượng', // 鳳
    'tiger': 'Hổ', // 虎
    'eagle': 'Ưng', // 鷹
    'wolf': 'Lang', // 狼
    'bear': 'Hùng', // 熊
    'snake': 'Xà', // 蛇
    'lion': 'Sư', // 獅
    'sword': 'Kiếm', // 劍
    'blade': 'Đao', // 刀
    'spear': 'Thương', // 槍
    'bow': 'Cung', // 弓
    'shield': 'Thuẫn', // 盾
    'armor': 'Giáp', // 甲
    'helmet': 'Mũ', // 帽
    'crown': 'Vương', // 王
    'king': 'Vương', // 王
    'emperor': 'Đế', // 帝
    'lord': 'Chúa', // 主
    'master': 'Sư', // 師
    'warrior': 'Võ', // 武
    'knight': 'Kỵ', // 騎
    'mage': 'Pháp', // 法
    'priest': 'Tăng', // 僧
    'monk': 'Tăng', // 僧
    'demon': 'Ma', // 魔
    'angel': 'Thiên', // 天
    'spirit': 'Linh', // 靈
    'ghost': 'Quỷ', // 鬼
    'fire': 'Hỏa', // 火
    'black': 'Hắc', // 黑
    'Black': 'Hắc', // 黑
    'BLACK': 'HẮC', // 黑
    'water': 'Thủy', // 水
    'earth': 'Thổ', // 土
    'wind': 'Phong', // 風
    'lightning': 'Lôi', // 雷
    'ice': 'Băng', // 冰
    'shadow': 'Ảnh', // 影
    'light': 'Quang', // 光
    'dark': 'Ám', // 暗
    'gold': 'Kim', // 金
    'silver': 'Ngân', // 銀
    'iron': 'Thiết', // 鐵
    'steel': 'Cương', // 鋼
    'crystal': 'Thủy', // 水
    'gem': 'Bảo', // 寶
    'pearl': 'Châu', // 珠
    'jade': 'Ngọc', // 玉
    'diamond': 'Kim', // 金
    'ruby': 'Hồng', // 紅
    'sapphire': 'Lam', // 藍
    'emerald': 'Lục', // 綠
    'mountain': 'Sơn', // 山
    'river': 'Giang', // 江
    'lake': 'Hồ', // 湖
    'sea': 'Hải', // 海
    'forest': 'Lâm', // 林
    'temple': 'Tự', // 寺
    'palace': 'Cung', // 宮
    'tower': 'Tháp', // 塔
    'castle': 'Thành', // 城
    'village': 'Thôn', // 村
    'city': 'Thành', // 城
    'kingdom': 'Vương', // 王
    'empire': 'Đế', // 帝
    'realm': 'Cảnh', // 境
    'world': 'Thế', // 世
    'heaven': 'Thiên', // 天
    'hell': 'Địa', // 地
    'paradise': 'Thiên', // 天
    'eternal': 'Vĩnh', // 永
    'divine': 'Thần', // 神
    'sacred': 'Thánh', // 聖
    'holy': 'Thánh', // 聖
    'blessed': 'Phúc', // 福
    'cursed': 'Ác', // 惡
    'ancient': 'Cổ', // 古
    'legendary': 'Truyền', // 傳
    'mythical': 'Thần', // 神
    'mystical': 'Huyền', // 玄
    'magical': 'Ma', // 魔
    'powerful': 'Lực', // 力
    'mighty': 'Hùng', // 雄
    'strong': 'Cường', // 強
    'brave': 'Dũng', // 勇
    'wise': 'Trí', // 智
    'noble': 'Quý', // 貴
    'royal': 'Vương', // 王
    'imperial': 'Đế', // 帝
    'celestial': 'Thiên', // 天
    'infernal': 'Địa', // 地
    'abyssal': 'U', // 幽
    'void': 'Không', // 空
    'chaos': 'Loạn', // 亂
    'order': 'Trật', // 秩
    'balance': 'Cân', // 衡
    'harmony': 'Hòa', // 和
    'peace': 'Bình', // 平
    'war': 'Chiến', // 戰
    'battle': 'Chiến', // 戰
    'victory': 'Thắng', // 勝
    'defeat': 'Bại', // 敗
    'honor': 'Danh', // 名
    'glory': 'Vinh', // 榮
    'fame': 'Danh', // 名
    'fortune': 'Vận', // 運
    'destiny': 'Mệnh', // 命
    'fate': 'Mệnh', // 命
    'soul': 'Hồn', // 魂
    'heart': 'Tâm', // 心
    'mind': 'Trí', // 智
    'spirit': 'Linh', // 靈
    'energy': 'Năng', // 能
    'power': 'Lực', // 力
    'strength': 'Lực', // 力
    'wisdom': 'Trí', // 智
    'knowledge': 'Tri', // 知
    'truth': 'Chân', // 真
    'justice': 'Công', // 公
    'freedom': 'Tự', // 自
    'liberty': 'Tự', // 自
    'hope': 'Hy', // 希
    'dream': 'Mộng', // 夢
    'nightmare': 'Ác', // 惡
    'fear': 'Sợ', // 懼
    'courage': 'Dũng', // 勇
    'love': 'Ái', // 愛
    'hate': 'Hận', // 恨
    'anger': 'Nộ', // 怒
    'joy': 'Hỷ', // 喜
    'sorrow': 'Bi', // 悲
    'pain': 'Thống', // 痛
    'pleasure': 'Lạc', // 樂
    'bliss': 'Phúc', // 福
    'suffering': 'Khổ', // 苦
    'enlightenment': 'Giác', // 覺
    'salvation': 'Cứu', // 救
    'redemption': 'Chuộc', // 贖
    'forgiveness': 'Tha', // 赦
    'mercy': 'Từ', // 慈
    'compassion': 'Bi', // 悲
    'kindness': 'Thiện', // 善
    'evil': 'Ác', // 惡
    'good': 'Thiện', // 善
    'pure': 'Thuần', // 純
    'corrupt': 'Bại', // 敗
    'holy': 'Thánh', // 聖
    'profane': 'Phàm', // 凡
    'sacred': 'Thánh', // 聖
    'blessed': 'Phúc', // 福
    'cursed': 'Ác', // 惡
    'divine': 'Thần', // 神
    'mortal': 'Phàm', // 凡
    'immortal': 'Bất', // 不
    'eternal': 'Vĩnh', // 永
    'temporary': 'Tạm', // 暫
    'permanent': 'Vĩnh', // 永
    'ancient': 'Cổ', // 古
    'modern': 'Hiện', // 現
    'future': 'Tương', // 將
    'past': 'Quá', // 過
    'present': 'Hiện', // 現
    'beginning': 'Sơ', // 初
    'end': 'Chung', // 終
    'middle': 'Trung', // 中
    'center': 'Trung', // 中
    'edge': 'Biên', // 邊
    'corner': 'Góc', // 角
    'side': 'Bên', // 邊
    'top': 'Đỉnh', // 頂
    'bottom': 'Đáy', // 底
    'front': 'Trước', // 前
    'back': 'Sau', // 後
    'left': 'Trái', // 左
    'right': 'Phải', // 右
    'north': 'Bắc', // 北
    'south': 'Nam', // 南
    'east': 'Đông', // 東
    'west': 'Tây', // 西
    'up': 'Lên', // 上
    'down': 'Xuống', // 下
    'high': 'Cao', // 高
    'low': 'Thấp', // 低
    'big': 'Lớn', // 大
    'small': 'Nhỏ', // 小
    'long': 'Dài', // 長
    'short': 'Ngắn', // 短
    'wide': 'Rộng', // 寬
    'narrow': 'Hẹp', // 窄
    'thick': 'Dày', // 厚
    'thin': 'Mỏng', // 薄
    'heavy': 'Nặng', // 重
    'light': 'Nhẹ', // 輕
    'fast': 'Nhanh', // 快
    'slow': 'Chậm', // 慢
    'quick': 'Nhanh', // 快
    'swift': 'Nhanh', // 快
    'rapid': 'Nhanh', // 快
    'sudden': 'Đột', // 突
    'gradual': 'Dần', // 漸
    'immediate': 'Tức', // 即
    'instant': 'Tức', // 即
    'moment': 'Khoảnh', // 頃
    'second': 'Giây', // 秒
    'minute': 'Phút', // 分
    'hour': 'Giờ', // 時
    'day': 'Ngày', // 日
    'night': 'Đêm', // 夜
    'morning': 'Sáng', // 晨
    'evening': 'Chiều', // 夕
    'dawn': 'Bình', // 平
    'dusk': 'Hoàng', // 黃
    'sunrise': 'Nhật', // 日
    'sunset': 'Lạc', // 落
    'moon': 'Nguyệt', // 月
    'star': 'Tinh', // 星
    'sky': 'Thiên', // 天
    'cloud': 'Vân', // 雲
    'rain': 'Vũ', // 雨
    'snow': 'Tuyết', // 雪
    'storm': 'Bão', // 暴
    'wind': 'Phong', // 風
    'breeze': 'Gió', // 風
    'calm': 'Tĩnh', // 靜
    'quiet': 'Tĩnh', // 靜
    'silent': 'Im', // 靜
    'loud': 'To', // 大
    'noisy': 'Ồn', // 喧
    'peaceful': 'Bình', // 平
    'tranquil': 'Tĩnh', // 靜
    'serene': 'Tĩnh', // 靜
    'gentle': 'Dịu', // 柔
    'soft': 'Mềm', // 軟
    'hard': 'Cứng', // 硬
    'rough': 'Thô', // 粗
    'smooth': 'Mịn', // 細
    'sharp': 'Sắc', // 銳
    'dull': 'Cùn', // 鈍
    'bright': 'Sáng', // 亮
    'dark': 'Tối', // 暗
    'clear': 'Rõ', // 清
    'cloudy': 'Mây', // 雲
    'foggy': 'Sương', // 霧
    'misty': 'Sương', // 霧
    'hazy': 'Mờ', // 朦
    'transparent': 'Trong', // 透
    'opaque': 'Đục', // 濁
    'solid': 'Rắn', // 固
    'liquid': 'Lỏng', // 液
    'gas': 'Khí', // 氣
    'hot': 'Nóng', // 熱
    'cold': 'Lạnh', // 冷
    'warm': 'Ấm', // 溫
    'cool': 'Mát', // 涼
    'freezing': 'Đóng', // 凍
    'burning': 'Cháy', // 燒
    'boiling': 'Sôi', // 沸
    'melting': 'Tan', // 融
    'frozen': 'Đóng', // 凍
    'melted': 'Tan', // 融
    'solid': 'Rắn', // 固
    'liquid': 'Lỏng', // 液
    'gas': 'Khí', // 氣
    'steam': 'Hơi', // 汽
    'smoke': 'Khói', // 煙
    'fire': 'Hỏa', // 火
    'flame': 'Lửa', // 火
    'spark': 'Tia', // 火
    'ember': 'Than', // 炭
    'ash': 'Tro', // 灰
    'smoke': 'Khói', // 煙
    'steam': 'Hơi', // 汽
    'mist': 'Sương', // 霧
    'fog': 'Sương', // 霧
    'dew': 'Sương', // 露
    'frost': 'Sương', // 霜
    'ice': 'Băng', // 冰
    'snow': 'Tuyết', // 雪
    'hail': 'Mưa', // 雨
    'rain': 'Vũ', // 雨
    'drizzle': 'Mưa', // 雨
    'shower': 'Mưa', // 雨
    'storm': 'Bão', // 暴
    'thunder': 'Sấm', // 雷
    'lightning': 'Lôi', // 雷
    'wind': 'Phong', // 風
    'breeze': 'Gió', // 風
    'gale': 'Gió', // 風
    'hurricane': 'Bão', // 暴
    'tornado': 'Lốc', // 龍
    'cyclone': 'Xoáy', // 旋
    'typhoon': 'Bão', // 暴
    'earthquake': 'Địa', // 地
    'volcano': 'Hỏa', // 火
    'lava': 'Nham', // 岩
    'magma': 'Nham', // 岩
    'rock': 'Đá', // 石
    'stone': 'Thạch', // 石
    'boulder': 'Đá', // 石
    'pebble': 'Sỏi', // 石
    'sand': 'Cát', // 沙
    'dust': 'Bụi', // 塵
    'dirt': 'Đất', // 土
    'soil': 'Đất', // 土
    'mud': 'Bùn', // 泥
    'clay': 'Đất', // 土
    'grass': 'Cỏ', // 草
    'leaf': 'Lá', // 葉
    'branch': 'Cành', // 枝
    'trunk': 'Thân', // 身
    'root': 'Rễ', // 根
    'flower': 'Hoa', // 花
    'petal': 'Cánh', // 瓣
    'seed': 'Hạt', // 種
    'fruit': 'Quả', // 果
    'berry': 'Quả', // 果
    'nut': 'Hạt', // 核
    'grain': 'Hạt', // 粒
    'wheat': 'Lúa', // 麥
    'rice': 'Gạo', // 米
    'corn': 'Ngô', // 玉
    'barley': 'Lúa', // 麥
    'oats': 'Yến', // 燕
    'rye': 'Lúa', // 麥
    'millet': 'Kê', // 稷
    'sorghum': 'Cao', // 高
    'buckwheat': 'Kiều', // 蕎
    'quinoa': 'Di', // 藜
    'amaranth': 'Amaranth', // 莧
    'teff': 'Teff', // 苔
    'spelt': 'Spelt', // 斯
    'kamut': 'Kamut', // 卡
    'emmer': 'Emmer', // 埃
    'einkorn': 'Einkorn', // 艾
    'durum': 'Durum', // 杜
    'semolina': 'Semolina', // 塞
    'couscous': 'Couscous', // 庫
    'bulgur': 'Bulgur', // 布
    'freekeh': 'Freekeh', // 弗
    'farro': 'Farro', // 法
    'barley': 'Lúa', // 麥
    'oats': 'Yến', // 燕
    'rye': 'Lúa', // 麥
    'millet': 'Kê', // 稷
    'sorghum': 'Cao', // 高
    'buckwheat': 'Kiều', // 蕎
    'quinoa': 'Di', // 藜
    'amaranth': 'Amaranth', // 莧
    'teff': 'Teff', // 苔
    'spelt': 'Spelt', // 斯
    'kamut': 'Kamut', // 卡
    'emmer': 'Emmer', // 埃
    'einkorn': 'Einkorn', // 艾
    'durum': 'Durum', // 杜
    'semolina': 'Semolina', // 塞
    'couscous': 'Couscous', // 庫
    'bulgur': 'Bulgur', // 布
    'freekeh': 'Freekeh', // 弗
    'farro': 'Farro' // 法
  };
  
  // Apply Chinese-style translation
  let result = translation;
  
  // Replace common words with Chinese-style equivalents
  for (const [english, chinese] of Object.entries(chineseStyleDict)) {
    const regex = new RegExp(`\\b${english}\\b`, 'gi');
    result = result.replace(regex, chinese);
  }
  
  // Capitalize first letter
  result = result.charAt(0).toUpperCase() + result.slice(1);
  
  return result;
}

// Enhanced dictionary-based translation as fallback
async function translateWithEnhancedDictionary(text, style = 'standard') {
  // Handle placeholder style - don't translate
  if (style === 'placeholder') {
    return {
      success: true,
      suggestion: text, // Return original text unchanged
      confidence: 1.0,
      service: 'Placeholder Protection',
      style: style
    };
  }
  
  // Enhanced Vietnamese translation dictionary for game terms
  const translationDict = {
    // Common game terms
    'select': 'chọn',
    'gear': 'trang bị',
    'equipment': 'trang bị',
    'weapon': 'vũ khí',
    'armor': 'áo giáp',
    'helmet': 'mũ',
    'shield': 'khiên',
    'sword': 'kiếm',
    'bow': 'cung',
    'staff': 'gậy',
    'ring': 'nhẫn',
    'necklace': 'dây chuyền',
    'bracelet': 'vòng tay',
    'boots': 'giày',
    'gloves': 'găng tay',
    'belt': 'thắt lưng',
    
    // Attributes
    'strength': 'sức mạnh',
    'dexterity': 'khéo léo',
    'endurance': 'sức chịu đựng',
    'wisdom': 'trí tuệ',
    'intelligence': 'trí thông minh',
    'health': 'sức khỏe',
    'mana': 'năng lượng phép thuật',
    'stamina': 'thể lực',
    'damage': 'sát thương',
    'attack': 'tấn công',
    'defense': 'phòng thủ',
    'block': 'chặn',
    'critical': 'chí mạng',
    'speed': 'tốc độ',
    'accuracy': 'độ chính xác',
    
    // Game actions
    'use': 'sử dụng',
    'equip': 'trang bị',
    'unequip': 'tháo trang bị',
    'drop': 'vứt bỏ',
    'sell': 'bán',
    'buy': 'mua',
    'craft': 'chế tạo',
    'upgrade': 'nâng cấp',
    'repair': 'sửa chữa',
    'enchant': 'phù phép',
    
    // Items
    'potion': 'thuốc',
    'scroll': 'cuộn giấy',
    'gem': 'đá quý',
    'crystal': 'tinh thể',
    'ore': 'quặng',
    'wood': 'gỗ',
    'leather': 'da',
    'cloth': 'vải',
    'metal': 'kim loại',
    'stone': 'đá',
    
    // Monsters
    'dragon': 'rồng',
    'goblin': 'yêu tinh',
    'orc': 'người orc',
    'troll': 'quái vật troll',
    'skeleton': 'bộ xương',
    'zombie': 'thây ma',
    'ghost': 'ma',
    'demon': 'quỷ',
    'angel': 'thiên thần',
    'beast': 'thú dữ',
    
    // Locations
    'dungeon': 'hầm ngục',
    'cave': 'hang động',
    'forest': 'rừng',
    'mountain': 'núi',
    'castle': 'lâu đài',
    'village': 'làng',
    'city': 'thành phố',
    'tower': 'tháp',
    'temple': 'đền thờ',
    'ruins': 'tàn tích',
    
    // Common words
    'the': 'cái',
    'a': 'một',
    'an': 'một',
    'of': 'của',
    'and': 'và',
    'or': 'hoặc',
    'with': 'với',
    'from': 'từ',
    'to': 'đến',
    'in': 'trong',
    'on': 'trên',
    'at': 'tại',
    'by': 'bởi',
    'for': 'cho',
    'is': 'là',
    'are': 'là',
    'was': 'đã là',
    'were': 'đã là',
    'will': 'sẽ',
    'can': 'có thể',
    'should': 'nên',
    'must': 'phải',
    'may': 'có thể',
    'might': 'có thể',
    'good': 'tốt',
    'bad': 'xấu',
    'great': 'tuyệt vời',
    'small': 'nhỏ',
    'large': 'lớn',
    'big': 'to',
    'new': 'mới',
    'old': 'cũ',
    'high': 'cao',
    'low': 'thấp',
    'fast': 'nhanh',
    'slow': 'chậm',
    'strong': 'mạnh',
    'weak': 'yếu',
    'powerful': 'mạnh mẽ',
    'magic': 'phép thuật',
    'fire': 'lửa',
    'water': 'nước',
    'earth': 'đất',
    'air': 'không khí',
    'light': 'ánh sáng',
    'dark': 'bóng tối',
    'ice': 'băng',
    'thunder': 'sấm sét',
    'poison': 'độc',
    'heal': 'chữa lành',
    'cure': 'chữa trị',
    'restore': 'phục hồi',
    'increase': 'tăng',
    'decrease': 'giảm',
    'boost': 'tăng cường',
    'reduce': 'giảm bớt',
    'enhance': 'tăng cường',
    'improve': 'cải thiện',
    'upgrade': 'nâng cấp',
    'level': 'cấp độ',
    'experience': 'kinh nghiệm',
    'skill': 'kỹ năng',
    'ability': 'khả năng',
    'spell': 'phép thuật',
    'item': 'vật phẩm',
    'inventory': 'túi đồ',
    'quest': 'nhiệm vụ',
    'mission': 'nhiệm vụ',
    'reward': 'phần thưởng',
    'prize': 'giải thưởng',
    'gold': 'vàng',
    'silver': 'bạc',
    'copper': 'đồng',
    'coin': 'đồng xu',
    'money': 'tiền',
    'price': 'giá',
    'cost': 'chi phí',
    'free': 'miễn phí',
    'cheap': 'rẻ',
    'expensive': 'đắt',
    'rare': 'hiếm',
    'common': 'thường',
    'legendary': 'huyền thoại',
    'epic': 'sử thi',
    'unique': 'độc nhất',
    'special': 'đặc biệt',
    'normal': 'bình thường',
    'quality': 'chất lượng',
    'durability': 'độ bền',
    'weight': 'trọng lượng',
    'size': 'kích thước',
    'color': 'màu sắc',
    'red': 'đỏ',
    'blue': 'xanh dương',
    'green': 'xanh lá',
    'yellow': 'vàng',
    'black': 'đen',
    'white': 'trắng',
    'purple': 'tím',
    'orange': 'cam',
    'pink': 'hồng',
    'brown': 'nâu',
    'gray': 'xám',
    'grey': 'xám'
  };
  
  // Enhanced translation function
  function translateToVietnamese(text) {
    const words = text.toLowerCase().split(/\s+/);
    const translatedWords = words.map(word => {
      // Remove punctuation for lookup
      const cleanWord = word.replace(/[^\w]/g, '');
      return translationDict[cleanWord] || word;
    });
    
    // Join words and restore some basic punctuation
    let result = translatedWords.join(' ');
    
    // Capitalize first letter
    result = result.charAt(0).toUpperCase() + result.slice(1);
    
    return result;
  }
  
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const vietnameseTranslation = translateToVietnamese(text);
  
  // Apply style-specific processing
  let finalTranslation = vietnameseTranslation;
  if (style === 'chinese_style') {
    finalTranslation = applyChineseStyle(vietnameseTranslation);
  }
  
  return {
    success: true,
    suggestion: finalTranslation,
    confidence: 0.75,
    service: 'Enhanced Dictionary',
    style: style
  };
}

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