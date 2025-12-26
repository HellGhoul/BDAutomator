const { ipcRenderer } = require('electron');

let accounts = [];
let running = {};
let editingId = null;
let outputs = {};
let webviews = {};
let activeTab = null;
let automationState = {}; // { [id]: 'running' | 'paused' | undefined }
let unscrollState = {}; // { [id]: 'running' | 'paused' | undefined }
  let browserState = {}; // { [id]: 'started' | undefined } - Track if browser is started
let encyclopediaData = {
  items: [],
  monsters: [],
  translations: [],
  titles: [],
  stats: null
};
let databaseSchema = null;
let activeDatabaseTable = null;
let isCrawling = false;
let crawlProgress = 0;

// ===== LOG VIEWER FUNCTIONALITY =====

let currentLogPage = 1;
let currentLogFile = 'automation.log';

function initializeLogViewer() {
  // Load available log files
  loadLogFiles();
  
  // Load initial logs and stats
  loadLogStats();
  loadLogs();
  
  // Add event listeners
  document.getElementById('applyLogFilters')?.addEventListener('click', () => {
    currentLogPage = 1;
    loadLogs();
  });
  
  document.getElementById('logFileSelect')?.addEventListener('change', (e) => {
    currentLogFile = e.target.value;
    currentLogPage = 1;
    loadLogs();
    loadLogStats();
  });
  
  document.getElementById('logLevelSelect')?.addEventListener('change', () => {
    currentLogPage = 1;
    loadLogs();
  });
  
  document.getElementById('logSearchInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      currentLogPage = 1;
      loadLogs();
    }
  });
  
  document.getElementById('prevLogPage')?.addEventListener('click', () => {
    if (currentLogPage > 1) {
      currentLogPage--;
      loadLogs();
    }
  });
  
  document.getElementById('nextLogPage')?.addEventListener('click', () => {
    currentLogPage++;
    loadLogs();
  });
  
  document.getElementById('clearLogsBtn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all logs?')) {
      clearLogs();
    }
  });
  
  document.getElementById('exportLogsBtn')?.addEventListener('click', () => {
    exportLogs();
  });
  
  document.getElementById('refreshLogsBtn')?.addEventListener('click', () => {
    loadLogs();
    loadLogStats();
  });
}

async function loadLogFiles() {
  try {
    const data = await ipcRenderer.invoke('get-log-files');
    
    const select = document.getElementById('logFileSelect');
    if (select) {
      select.innerHTML = '';
      data.files.forEach(file => {
        const option = document.createElement('option');
        option.value = file.name;
        option.textContent = `${file.name} (${file.sizeFormatted})`;
        select.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading log files:', error);
  }
}

async function loadLogStats() {
  try {
    const data = await ipcRenderer.invoke('get-log-stats', { file: currentLogFile });
    
    updateLogStatsDisplay(data);
  } catch (error) {
    console.error('Error loading log stats:', error);
  }
}

async function loadLogs() {
  const container = document.getElementById('logsContainer');
  if (!container) return;
  
  container.innerHTML = '<div class="text-center text-gray-400 py-8"><div class="text-lg">🔄 Loading logs...</div></div>';
  
  try {
    const level = document.getElementById('logLevelSelect')?.value;
    const search = document.getElementById('logSearchInput')?.value;

    const data = await ipcRenderer.invoke('get-logs', {
      file: currentLogFile,
      page: currentLogPage,
      limit: 100,
      level: level,
      search: search
    });
    
    displayLogs(data.logs);
    updateLogPagination(data);
    updateLogCount(data.total);
  } catch (error) {
    console.error('Error loading logs:', error);
    container.innerHTML = '<div class="alert alert-danger text-red-400">Error loading logs</div>';
  }
}

function displayLogs(logs) {
  const container = document.getElementById('logsContainer');
  if (!container) return;
  
  if (logs.length === 0) {
    container.innerHTML = '<div class="text-center text-gray-400 py-8"><p>No logs found</p></div>';
    return;
  }

  const html = logs.map(log => createLogEntry(log)).join('');
  container.innerHTML = html;
}

function createLogEntry(log) {
  const timestamp = new Date(log.timestamp).toLocaleString();
  const details = log.details ? JSON.stringify(log.details, null, 2) : '';
  
  const levelClass = {
    'INFO': 'border-blue-500',
    'WARN': 'border-yellow-500',
    'ERROR': 'border-red-500',
    'DEBUG': 'border-gray-500'
  }[log.level] || 'border-gray-500';
  
  const levelColor = {
    'INFO': 'text-blue-400',
    'WARN': 'text-yellow-400',
    'ERROR': 'text-red-400',
    'DEBUG': 'text-gray-400'
  }[log.level] || 'text-gray-400';
  
  return `
    <div class="log-entry mb-3 p-3 border-l-4 ${levelClass} bg-rpg-darker/30 rounded">
      <div class="flex justify-between items-start mb-2">
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-400">${timestamp}</span>
          <span class="font-bold ${levelColor}">[${log.level}]</span>
          <span class="text-xs text-green-400">${log.file}:${log.function}:${log.line}</span>
        </div>
      </div>
      <div class="text-white mb-2">${escapeHtml(log.message)}</div>
      ${details ? `<div class="text-xs text-gray-400 bg-black/20 p-2 rounded whitespace-pre-wrap">${escapeHtml(details)}</div>` : ''}
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateLogStatsDisplay(stats) {
  const totalElement = document.getElementById('totalLogs');
  const errorElement = document.getElementById('errorCount');
  const warningElement = document.getElementById('warningCount');
  const timeRangeElement = document.getElementById('timeRange');
  
  if (totalElement) totalElement.textContent = stats.total.toLocaleString();
  if (errorElement) errorElement.textContent = (stats.byLevel.ERROR || 0).toLocaleString();
  if (warningElement) warningElement.textContent = (stats.byLevel.WARN || 0).toLocaleString();
  
  if (timeRangeElement && stats.timeRange.start && stats.timeRange.end) {
    const start = new Date(stats.timeRange.start).toLocaleDateString();
    const end = new Date(stats.timeRange.end).toLocaleDateString();
    timeRangeElement.textContent = `${start} - ${end}`;
  }
}

function updateLogPagination(data) {
  const pageInfo = document.getElementById('logPageInfo');
  const prevBtn = document.getElementById('prevLogPage');
  const nextBtn = document.getElementById('nextLogPage');
  
  if (pageInfo) pageInfo.textContent = `Page ${data.page} of ${data.totalPages}`;
  if (prevBtn) prevBtn.disabled = !data.hasPrev;
  if (nextBtn) nextBtn.disabled = !data.hasNext;
}

function updateLogCount(total) {
  const countElement = document.getElementById('logCount');
  if (countElement) countElement.textContent = `${total.toLocaleString()} logs`;
}

async function clearLogs() {
  try {
    const result = await ipcRenderer.invoke('clear-logs', { file: currentLogFile });
    
    if (result.success) {
      alert('Logs cleared successfully');
      loadLogs();
      loadLogStats();
    } else {
      alert('Error clearing logs');
    }
  } catch (error) {
    console.error('Error clearing logs:', error);
    alert('Error clearing logs');
  }
}

async function exportLogs() {
  try {
    const level = document.getElementById('logLevelSelect')?.value;
    const search = document.getElementById('logSearchInput')?.value;

    const data = await ipcRenderer.invoke('get-logs', {
      file: currentLogFile,
      page: 1,
      limit: 10000, // Export all logs
      level: level,
      search: search
    });

    // Create and download the file
    const blob = new Blob([JSON.stringify(data.logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentLogFile.replace('.log', '')}_export.json`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting logs:', error);
    alert('Error exporting logs');
  }
}

function renderAccounts() {
  const list = document.getElementById('account-list');
  list.innerHTML = '';
  accounts.forEach(acc => {
    const state = automationState[acc.id];
    const unscrollStateValue = unscrollState[acc.id];
    const isRunning = running[acc.id];
    const isPaused = state === 'paused';
    const isActive = state === 'running';
    const isUnscrollRunning = unscrollStateValue === 'running';
    const isUnscrollPaused = unscrollStateValue === 'paused';
    const isBrowserStarted = browserState[acc.id] === 'started';
    const toggleLabel = isActive ? 'Pause' : (isPaused ? 'Resume' : 'Start Auto');
    const toggleIcon = isActive ? '⏸️' : (isPaused ? '▶️' : '🤖');
    const unscrollToggleLabel = isUnscrollRunning ? 'Pause' : (isUnscrollPaused ? 'Resume' : 'Auto Hunt');
    const unscrollToggleIcon = isUnscrollRunning ? '⏸️' : (isUnscrollPaused ? '▶️' : '📜');
    const div = document.createElement('div');
    div.className = `rpg-border rounded-lg p-4 ${isRunning ? 'bg-green-900/20' : 'bg-rpg-darker'} transition-all duration-300`;
    div.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center space-x-3">
          <span class="text-2xl">${isRunning ? '⚔️' : '🛡️'}</span>
          <div>
            <h3 class="text-xl font-bold text-rpg-gold">${acc.username}</h3>
            <p class="text-sm text-gray-400">Level: ${acc.options ? JSON.stringify(acc.options) : '{}'} </p>
            ${isBrowserStarted ? '<p class="text-sm text-purple-400">🌐 Browser: ON</p>' : '<p class="text-sm text-gray-400">🌐 Browser: OFF</p>'}
            ${isActive ? '<p class="text-sm text-green-400">🤖 Auto: ON</p>' : isPaused ? '<p class="text-sm text-yellow-400">⏸️ Auto Paused</p>' : ''}
            ${isUnscrollRunning ? '<p class="text-sm text-blue-400">📜 Unscroll: ON</p>' : isUnscrollPaused ? '<p class="text-sm text-yellow-400">⏸️ Unscroll Paused</p>' : ''}
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button onclick="editAccount('${acc.id}')" 
                  class="rpg-button px-3 py-1 rounded text-sm">✏️ Edit</button>
          <button onclick="deleteAccount('${acc.id}')" 
                  class="rpg-button px-3 py-1 rounded text-sm bg-red-900/50 border-red-500 text-red-300 hover:bg-red-700">🗑️ Delete</button>
          
          <!-- New Button System -->
          <button onclick="startBrowser('${acc.id}')" ${isRunning ? 'disabled' : ''} 
                  class="rpg-button px-3 py-1 rounded text-sm ${isRunning ? 'opacity-50 cursor-not-allowed' : 'bg-purple-900/50 border-purple-500 text-purple-300'}">🌐 Start Browser</button>
          
          <button onclick="toggleAutomation('${acc.id}')" ${!isBrowserStarted && !isActive && !isPaused ? 'disabled' : ''} 
                  class="rpg-button px-3 py-1 rounded text-sm ${!isBrowserStarted && !isActive && !isPaused ? 'opacity-50 cursor-not-allowed' : ''} ${(isActive || isPaused) ? 'bg-green-900/50 border-green-500 text-green-300' : ''}">${toggleIcon} ${toggleLabel}</button>
          
          <button onclick="toggleUnscroll('${acc.id}')" ${!isBrowserStarted && !isUnscrollRunning && !isUnscrollPaused ? 'disabled' : ''} 
                  class="rpg-button px-3 py-1 rounded text-sm ${!isBrowserStarted && !isUnscrollRunning && !isUnscrollPaused ? 'opacity-50 cursor-not-allowed' : ''} ${(isUnscrollRunning || isUnscrollPaused) ? 'bg-blue-900/50 border-blue-500 text-blue-300' : ''}">${unscrollToggleIcon} ${unscrollToggleLabel}</button>
          
          <button onclick="stopAccount('${acc.id}')" ${isRunning ? '' : 'disabled'} 
                  class="rpg-button px-3 py-1 rounded text-sm ${isRunning ? '' : 'opacity-50 cursor-not-allowed'} bg-red-900/50 border-red-500 text-red-300 hover:bg-red-700">⏹️ Stop</button>
        </div>
      </div>
    `;
    list.appendChild(div);
  });
}

function renderTabs() {
  const tabBar = document.getElementById('tab-bar');
  const tabContent = document.getElementById('tab-content');
  tabBar.innerHTML = '';
  tabContent.innerHTML = '';

  // Create tabs for each account
  accounts.forEach(acc => {
    const accountTab = document.createElement('div');
    accountTab.className = `tab px-4 py-2 rounded-t-lg ${activeTab === acc.id ? 'active' : ''}`;
    accountTab.innerHTML = `👤 ${acc.username}`;
    accountTab.onclick = () => switchTab(acc.id);
    tabBar.appendChild(accountTab);
  });

  // Logs tab (system logs)
  const logsTab = document.createElement('div');
  logsTab.className = `tab px-4 py-2 rounded-t-lg ${activeTab === 'logs' ? 'active' : ''}`;
  logsTab.innerHTML = '📋 System Logs';
  logsTab.onclick = () => switchTab('logs');
  tabBar.appendChild(logsTab);

  // Render tab content
  if (activeTab === 'logs') {
    renderLogsTab();
  } else {
    // Render account-specific tab
    const account = accounts.find(acc => acc.id === activeTab);
    if (account) {
      renderAccountTab(account);
    }
  }
}

function renderAccountTab(account) {
  const tabContent = document.getElementById('tab-content');
  
  // Account-specific log content (newest logs on top)
  const outDiv = document.createElement('div');
  outDiv.className = 'output p-4 h-[600px] overflow-y-auto';
  outDiv.id = `output-${account.id}`;
  
  const output = outputs[account.id] || '';
  const lines = output.split('\n').filter(line => line.trim());
  
  // Reverse to show newest first (top to bottom)
  const reversedLines = lines.reverse();
  
  outDiv.innerHTML = `<div class="mb-4 p-2 border-l-4 border-rpg-gold bg-rpg-darker/50">
    <span class="text-rpg-gold font-bold">[${account.username}]:</span>
    <div class="text-green-400 mt-1 whitespace-pre-wrap">${reversedLines.join('\n')}</div>
  </div>`;
  
  tabContent.appendChild(outDiv);
}

function renderOutputTab() {
  const tabContent = document.getElementById('tab-content');
  
  // Terminal tab content (newest logs on top)
  const outDiv = document.createElement('div');
  outDiv.className = 'output p-4 h-[600px] overflow-y-auto';
  const outputEntries = Object.entries(outputs).map(([id, out]) => {
    const acc = accounts.find(a => a.id === id);
    return `<div class="mb-4 p-2 border-l-4 border-rpg-gold bg-rpg-darker/50">
      <span class="text-rpg-gold font-bold">[${acc ? acc.username : id}]:</span>
      <div class="text-green-400 mt-1 whitespace-pre-wrap">${out}</div>
    </div>`;
  });
  outDiv.innerHTML = outputEntries.reverse().join('');
  tabContent.appendChild(outDiv);
}

function renderLogsTab() {
  const tabContent = document.getElementById('tab-content');
  
  // Logs tab content
  const logsDiv = document.createElement('div');
  logsDiv.className = 'p-4';
  logsDiv.innerHTML = `
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-rpg-gold mb-4">📋 Application Logs</h2>
      <p class="text-gray-400">View and analyze logs from all automation scripts and processes</p>
    </div>
    
    <!-- Log Controls -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">Log File</label>
        <select id="logFileSelect" class="w-full bg-rpg-darker border border-rpg-gold text-white rounded px-3 py-2">
          <option value="automation.log">automation.log</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">Log Level</label>
        <select id="logLevelSelect" class="w-full bg-rpg-darker border border-rpg-gold text-white rounded px-3 py-2">
          <option value="">All Levels</option>
          <option value="DEBUG">DEBUG</option>
          <option value="INFO">INFO</option>
          <option value="WARN">WARN</option>
          <option value="ERROR">ERROR</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">Search</label>
        <input type="text" id="logSearchInput" placeholder="Search in logs..." 
               class="w-full bg-rpg-darker border border-rpg-gold text-white rounded px-3 py-2">
      </div>
      <div class="flex items-end">
        <button id="applyLogFilters" class="w-full bg-rpg-gold text-black font-bold py-2 px-4 rounded hover:bg-yellow-400 transition-colors">
          🔍 Apply Filters
        </button>
      </div>
    </div>
    
    <!-- Log Statistics -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-rpg-darker border border-rpg-gold rounded-lg p-4 text-center">
        <div class="text-2xl font-bold text-rpg-gold" id="totalLogs">0</div>
        <div class="text-sm text-gray-400">Total Logs</div>
      </div>
      <div class="bg-rpg-darker border border-rpg-gold rounded-lg p-4 text-center">
        <div class="text-2xl font-bold text-red-400" id="errorCount">0</div>
        <div class="text-sm text-gray-400">Errors</div>
      </div>
      <div class="bg-rpg-darker border border-rpg-gold rounded-lg p-4 text-center">
        <div class="text-2xl font-bold text-yellow-400" id="warningCount">0</div>
        <div class="text-sm text-gray-400">Warnings</div>
      </div>
      <div class="bg-rpg-darker border border-rpg-gold rounded-lg p-4 text-center">
        <div class="text-sm text-gray-400" id="timeRange">-</div>
        <div class="text-sm text-gray-400">Time Range</div>
      </div>
    </div>
    
    <!-- Log Entries -->
    <div class="bg-rpg-darker border border-rpg-gold rounded-lg">
      <div class="border-b border-rpg-gold p-4 flex justify-between items-center">
        <h3 class="text-lg font-semibold text-white">Log Entries</h3>
        <div class="flex items-center gap-4">
          <span class="text-sm text-gray-400" id="logCount">0 logs</span>
          <div class="flex gap-2">
            <button id="prevLogPage" class="bg-rpg-gold text-black px-3 py-1 rounded text-sm hover:bg-yellow-400 disabled:opacity-50">
              Previous
            </button>
            <span id="logPageInfo" class="bg-rpg-darker text-white px-3 py-1 rounded text-sm">Page 1</span>
            <button id="nextLogPage" class="bg-rpg-gold text-black px-3 py-1 rounded text-sm hover:bg-yellow-400 disabled:opacity-50">
              Next
            </button>
          </div>
        </div>
      </div>
      <div id="logsContainer" class="p-4 h-96 overflow-y-auto">
        <div class="text-center text-gray-400 py-8">
          <div class="text-lg">🔄 Loading logs...</div>
        </div>
      </div>
    </div>
    
    <!-- Action Buttons -->
    <div class="flex gap-4 mt-6">
      <button id="clearLogsBtn" class="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors">
        🗑️ Clear Logs
      </button>
      <button id="exportLogsBtn" class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors">
        📥 Export Logs
      </button>
      <button id="refreshLogsBtn" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors">
        🔄 Refresh
      </button>
    </div>
  `;
  
  tabContent.appendChild(logsDiv);
  
  // Initialize log functionality
  initializeLogViewer();
}

function switchTab(tabId) {
  activeTab = tabId;
  renderTabs();
}

function appendOutput(id, text) {
  outputs[id] = (outputs[id] || '') + text;
  
  // Only re-render if the current tab is for this account
  if (activeTab === id) {
    const account = accounts.find(acc => acc.id === id);
    if (account) {
      renderAccountTab(account);
    }
  }
}

async function loadAccounts() {
  accounts = await ipcRenderer.invoke('get-accounts');
  if (!Array.isArray(accounts)) accounts = [];
  outputs = {};
  automationState = {};
  unscrollState = {};
  browserState = {}; // Reset browser state
  
  // Load running states for all accounts
  for (const acc of accounts) {
    running[acc.id] = await ipcRenderer.invoke('is-running', acc.id);
    automationState[acc.id] = running[acc.id] ? 'running' : undefined;
    // Check if unscroll is running
    const isUnscrollRunning = await ipcRenderer.invoke('is-unscroll-running', acc.id);
    unscrollState[acc.id] = isUnscrollRunning ? 'running' : undefined;
  }
  
  // Render only once after loading all states
  renderAccounts();
  
  // Set default active tab to first account if none selected
  if (!activeTab && accounts.length > 0) {
    activeTab = accounts[0].id;
  }
  
  renderTabs();
  
  // Load initial encyclopedia data
  await loadAllEncyclopediaData();
  
  // Populate crawl account dropdown
  populateCrawlAccountDropdown();
}

// Encyclopedia Modal Functions
window.openEncyclopedia = function() {
  console.log('🔓 Opening encyclopedia modal...');
  document.getElementById('encyclopedia-modal').classList.remove('hidden');
  
  // Show loading state
  const contentSection = document.getElementById('encyclopedia-content');
  if (contentSection) {
    contentSection.innerHTML = `
      <div class="text-center text-gray-400 mt-8">
        <div class="text-lg">🔄 Loading encyclopedia data...</div>
        <div class="text-sm mt-2">Please wait while we fetch the latest data</div>
      </div>
    `;
  }
  
  // Load data and show debug info
  loadAllEncyclopediaData().then(() => {
    console.log('✅ Encyclopedia data loaded, showing debug info');
    if (contentSection) {
      const debugInfo = document.getElementById('debug-info');
      if (debugInfo) {
        debugInfo.innerHTML = `
          <div class="text-xs text-gray-500 mt-2">
            📊 Data loaded: ${encyclopediaData?.items?.length || 0} items, 
            ${encyclopediaData?.monsters?.length || 0} monsters, 
            ${encyclopediaData?.translations?.length || 0} translations, 
            ${encyclopediaData?.titles?.length || 0} titles
          </div>
        `;
      }
    }
  });
};

window.closeEncyclopedia = function() {
  document.getElementById('encyclopedia-modal').classList.add('hidden');
};

// ===== Database Modal Functions =====
window.openDatabase = async function() {
  document.getElementById('database-modal').classList.remove('hidden');
  const tablesContainer = document.getElementById('database-tables');
  if (tablesContainer) {
    tablesContainer.innerHTML = '<div class="text-gray-400">Loading database schema...</div>';
  }
  await refreshDatabaseSchema();
};

window.closeDatabase = function() {
  document.getElementById('database-modal').classList.add('hidden');
};

window.refreshDatabaseSchema = async function() {
  try {
    await ipcRenderer.invoke('init-db');
    const data = await ipcRenderer.invoke('get-db-schema');
    databaseSchema = data;
    renderDatabaseTables();
    if (activeDatabaseTable) {
      renderDatabaseSchema(activeDatabaseTable);
      await loadDatabaseTableData(activeDatabaseTable);
    } else if (databaseSchema.tables.length > 0) {
      selectDatabaseTable(databaseSchema.tables[0].name);
    } else {
      renderDatabaseSchema(null);
      renderDatabaseTableData([]);
    }
  } catch (error) {
    console.error('Error loading database schema:', error);
    const tablesContainer = document.getElementById('database-tables');
    if (tablesContainer) {
      tablesContainer.innerHTML = '<div class="text-red-400">Failed to load schema</div>';
    }
  }
};

function renderDatabaseTables() {
  const tablesContainer = document.getElementById('database-tables');
  if (!tablesContainer) return;

  const tables = databaseSchema?.tables || [];
  if (tables.length === 0) {
    tablesContainer.innerHTML = '<div class="text-gray-400">No tables found</div>';
    return;
  }

  tablesContainer.innerHTML = tables.map(table => {
    const isActive = table.name === activeDatabaseTable;
    const activeClass = isActive ? 'bg-rpg-gold text-black' : 'bg-rpg-dark text-rpg-gold';
    return `
      <button onclick="selectDatabaseTable('${table.name.replace(/'/g, "\\'")}')" 
              class="w-full text-left rpg-button px-3 py-2 rounded ${activeClass}">
        ${table.name}
      </button>
    `;
  }).join('');
}

window.selectDatabaseTable = async function(tableName) {
  activeDatabaseTable = tableName;
  renderDatabaseTables();
  renderDatabaseSchema(tableName);
  await loadDatabaseTableData(tableName);
};

function renderDatabaseSchema(tableName) {
  const schemaContainer = document.getElementById('database-schema');
  if (!schemaContainer) return;
  if (!tableName) {
    schemaContainer.innerHTML = 'Select a table to view its schema.';
    return;
  }
  const table = databaseSchema?.tables?.find(t => t.name === tableName);
  if (!table) {
    schemaContainer.innerHTML = 'Table not found in schema.';
    return;
  }

  const rows = table.columns.map(col => `
    <tr class="border-b border-rpg-gold/20">
      <td class="py-1 pr-4 font-bold text-rpg-gold">${col.name}</td>
      <td class="py-1 pr-4 text-gray-300">${col.type || 'TEXT'}</td>
      <td class="py-1 pr-4 text-gray-400">${col.notnull ? 'NOT NULL' : ''}</td>
      <td class="py-1 pr-4 text-gray-400">${col.pk ? 'PK' : ''}</td>
      <td class="py-1 text-gray-400">${col.defaultValue ?? ''}</td>
    </tr>
  `).join('');

  schemaContainer.innerHTML = `
    <div class="text-sm text-gray-400 mb-2">Table: <span class="text-rpg-gold">${table.name}</span></div>
    <div class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="border-b border-rpg-gold/40 text-gray-300">
            <th class="text-left py-1 pr-4">Column</th>
            <th class="text-left py-1 pr-4">Type</th>
            <th class="text-left py-1 pr-4">Constraints</th>
            <th class="text-left py-1 pr-4">Key</th>
            <th class="text-left py-1">Default</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

window.refreshDatabaseTable = async function() {
  if (!activeDatabaseTable) return;
  await loadDatabaseTableData(activeDatabaseTable);
};

async function loadDatabaseTableData(tableName) {
  const limit = Number(document.getElementById('database-limit')?.value) || 100;
  const offset = Number(document.getElementById('database-offset')?.value) || 0;
  try {
    const data = await ipcRenderer.invoke('get-db-table-data', { table: tableName, limit, offset });
    renderDatabaseTableData(data.rows || []);
  } catch (error) {
    console.error('Error loading table data:', error);
    const container = document.getElementById('database-table-data');
    if (container) {
      container.innerHTML = `<div class="text-red-400">Failed to load data: ${error.message}</div>`;
    }
  }
}

function renderDatabaseTableData(rows) {
  const container = document.getElementById('database-table-data');
  if (!container) return;
  if (!rows || rows.length === 0) {
    container.innerHTML = '<div class="text-gray-400">No rows found</div>';
    return;
  }

  const columns = Object.keys(rows[0]);
  const header = columns.map(col => `<th class="text-left py-1 px-2 text-gray-300">${col}</th>`).join('');
  const body = rows.map(row => {
    const cells = columns.map(col => {
      const value = row[col];
      const text = value === null || value === undefined ? '' : String(value);
      return `<td class="py-1 px-2 text-gray-300">${escapeHtml(text)}</td>`;
    }).join('');
    return `<tr class="border-b border-rpg-gold/20">${cells}</tr>`;
  }).join('');

  container.innerHTML = `
    <table class="min-w-full text-xs">
      <thead class="border-b border-rpg-gold/40"><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

window.runDatabaseQuery = async function() {
  const input = document.getElementById('database-query-input');
  const resultsContainer = document.getElementById('database-query-results');
  if (!input || !resultsContainer) return;
  const query = input.value.trim();
  if (!query) {
    resultsContainer.innerHTML = '<div class="text-yellow-400">Query is empty.</div>';
    return;
  }

  resultsContainer.innerHTML = '<div class="text-gray-400">Running query...</div>';
  try {
    const result = await ipcRenderer.invoke('execute-db-query', { query });
    if (result.type === 'rows') {
      const rows = result.rows || [];
      resultsContainer.innerHTML = `<div class="text-gray-400 mb-2">Rows: ${rows.length}</div>`;
      if (rows.length > 0) {
        resultsContainer.innerHTML += renderRowsTable(rows);
      }
    } else if (result.type === 'run') {
      resultsContainer.innerHTML = `<div class="text-green-400">Query executed. Changes: ${result.changes}, Last ID: ${result.lastID}</div>`;
      await refreshDatabaseSchema();
    } else if (result.type === 'error') {
      resultsContainer.innerHTML = `<div class="text-red-400">Error: ${result.error}</div>`;
    }
  } catch (error) {
    console.error('Error executing query:', error);
    resultsContainer.innerHTML = `<div class="text-red-400">Error: ${error.message}</div>`;
  }
};

function renderRowsTable(rows) {
  const columns = Object.keys(rows[0] || {});
  const header = columns.map(col => `<th class="text-left py-1 px-2 text-gray-300">${col}</th>`).join('');
  const body = rows.map(row => {
    const cells = columns.map(col => {
      const value = row[col];
      const text = value === null || value === undefined ? '' : String(value);
      return `<td class="py-1 px-2 text-gray-300">${escapeHtml(text)}</td>`;
    }).join('');
    return `<tr class="border-b border-rpg-gold/20">${cells}</tr>`;
  }).join('');

  return `
    <div class="overflow-x-auto">
      <table class="min-w-full text-xs">
        <thead class="border-b border-rpg-gold/40"><tr>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function populateCrawlAccountDropdown() {
  const dropdown = document.getElementById('crawl-account');
  if (!dropdown) return;
  
  dropdown.innerHTML = '<option value="">Select an account...</option>';
  accounts.forEach(acc => {
    const option = document.createElement('option');
    option.value = acc.id;
    option.textContent = acc.username;
    dropdown.appendChild(option);
  });
}

window.startCrawling = async function() {
  const accountId = document.getElementById('crawl-account').value;
  if (!accountId) {
    alert('Please select an account to use for crawling');
    return;
  }

  const account = accounts.find(a => a.id === accountId);
  if (!account) {
    alert('Selected account not found');
    return;
  }

  // Get crawl options
  const crawlOptions = {
    items: document.getElementById('crawl-items').checked,
    monsters: document.getElementById('crawl-monsters').checked,
    translations: document.getElementById('crawl-translations').checked,
    titles: document.getElementById('crawl-titles').checked
  };

  // Check if at least one option is selected
  if (!Object.values(crawlOptions).some(v => v)) {
    alert('Please select at least one data type to crawl');
    return;
  }

  try {
    isCrawling = true;
    crawlProgress = 0;
    updateCrawlUI();
    
    // Start encyclopedia crawling
    await ipcRenderer.invoke('start-encyclopedia-crawl', account, crawlOptions);
    
    // Update UI
    document.getElementById('start-crawl-btn').disabled = true;
    document.getElementById('start-crawl-btn').textContent = '🕷️ Crawling...';
    
  } catch (error) {
    console.error('Error starting crawl:', error);
    alert('Failed to start crawling: ' + error.message);
    isCrawling = false;
    updateCrawlUI();
  }
};

function updateCrawlUI() {
  const statusDiv = document.getElementById('crawl-status');
  const progressDiv = document.getElementById('crawl-progress');
  const startBtn = document.getElementById('start-crawl-btn');
  
  if (isCrawling) {
    statusDiv.innerHTML = `
      <div class="text-green-400">🕷️ Crawling in progress...</div>
      <div class="text-sm text-gray-400">Gathering game data...</div>
    `;
    progressDiv.classList.remove('hidden');
    startBtn.disabled = true;
    startBtn.textContent = '🕷️ Crawling...';
  } else {
    statusDiv.innerHTML = `
      <div class="text-gray-400">No crawling in progress</div>
    `;
    progressDiv.classList.add('hidden');
    startBtn.disabled = false;
    startBtn.textContent = '🚀 Start Crawling';
  }
}

function updateCrawlProgress(progress) {
  crawlProgress = progress;
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  
  if (progressBar && progressText) {
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${progress}%`;
  }
}

// Encyclopedia functions
window.populateTitleFilter = async function() {
  try {
    const titleSelect = document.getElementById('filter-title');
    if (!titleSelect) return;
    
    // Get titles from encyclopedia data
    if (encyclopediaData && encyclopediaData.titles) {
      const titles = encyclopediaData.titles;
      
      // Clear existing options except the first one
      titleSelect.innerHTML = '<option value="">All Titles</option>';
      
      // Add title options
      titles.forEach(title => {
        const option = document.createElement('option');
        option.value = title.name;
        option.textContent = title.name;
        titleSelect.appendChild(option);
      });
      
      console.log(`✅ Populated title filter with ${titles.length} titles`);
    } else {
      // Fallback to server-side fetch
      const titles = await ipcRenderer.invoke('get-encyclopedia-titles');
      if (titles && titles.length > 0) {
        titleSelect.innerHTML = '<option value="">All Titles</option>';
        titles.forEach(title => {
          const option = document.createElement('option');
          option.value = title.name;
          option.textContent = title.name;
          titleSelect.appendChild(option);
        });
        console.log(`✅ Populated title filter with ${titles.length} titles from server`);
      }
    }
  } catch (error) {
    console.error('Error populating title filter:', error);
  }
};

window.searchEncyclopedia = async function() {
  const query = document.getElementById('encyclopedia-search').value.trim();
  if (!query) return;

  try {
    // Search in the current encyclopedia data
    if (encyclopediaData) {
      const searchText = query.toLowerCase();
      const results = { items: [], titles: [], total: 0 };
      
      // Search in items
      if (encyclopediaData.items) {
        results.items = encyclopediaData.items.filter(item => (
          item.name.toLowerCase().includes(searchText) ||
          item.type.toLowerCase().includes(searchText) ||
          (item.requirements.Class && item.requirements.Class.toLowerCase().includes(searchText)) ||
          (item.description && item.description.toLowerCase().includes(searchText)) ||
          (item.plainAttributes && item.plainAttributes.some(attr => attr.toLowerCase().includes(searchText))) ||
          (item.plainReq && item.plainReq.some(req => req.toLowerCase().includes(searchText))) ||
          // Search in titles
          (item.title && item.title.toLowerCase().includes(searchText)) ||
          (item.prefix && item.prefix.toLowerCase().includes(searchText)) ||
          (item.suffix && item.suffix.toLowerCase().includes(searchText))
        ));
      }
      
      // Search in titles
      if (encyclopediaData.titles) {
        results.titles = encyclopediaData.titles.filter(title => (
          title.name.toLowerCase().includes(searchText) ||
          (title.prefix && title.prefix.toLowerCase().includes(searchText)) ||
          (title.suffix && title.suffix.toLowerCase().includes(searchText)) ||
          (title.plainAttributes && title.plainAttributes.some(attr => attr.toLowerCase().includes(searchText))) ||
          (title.plainReq && title.plainReq.some(req => req.toLowerCase().includes(searchText)))
        ));
      }
      
      results.total = results.items.length + results.titles.length;
      
      if (results.total > 0) {
        displayEncyclopediaResults(results, `Search results for: "${query}" (${results.total} total)`);
      } else {
        displayEncyclopediaResults(results, `No results found for: "${query}"`);
      }
    } else {
      // Fallback to server-side search if no local data
    const results = await ipcRenderer.invoke('search-encyclopedia', query);
    displayEncyclopediaResults(results, `Search results for: "${query}"`);
    }
  } catch (error) {
    console.error('Search error:', error);
  }
};

window.filterEncyclopedia = async function(type) {
  try {
    console.log(`🔍 Filtering encyclopedia for type: ${type}`);
    let data = [];
    let title = '';
    
    switch (type) {
      case 'items':
        console.log('📦 Fetching all items...');
        data = await ipcRenderer.invoke('get-encyclopedia-items');
        title = 'Items';
        break;
      case 'monsters':
        console.log('👹 Fetching monsters...');
        data = await ipcRenderer.invoke('get-encyclopedia-monsters');
        title = 'Monsters';
        break;
      case 'translations':
        console.log('⚡ Fetching translations...');
        data = await ipcRenderer.invoke('get-encyclopedia-translations');
        title = 'Translations';
        break;
      case 'titles':
        console.log('📋 Fetching titles...');
        data = await ipcRenderer.invoke('get-encyclopedia-titles');
        title = 'Titles';
        break;
      case 'recipes':
        console.log('📖 Fetching recipes...');
        data = await ipcRenderer.invoke('get-encyclopedia-items', { type: 'recipe' });
        title = 'Recipes';
        break;
    }
    
    console.log(`✅ Received ${data?.length || 0} ${type}`);
    if (data && data.length > 0) {
      console.log('🔍 Sample data:', data.slice(0, 2).map(item => ({
        name: item.name,
        type: item.type,
        isLegendary: item.isLegendary,
        isCraftable: item.isCraftable
      })));
    }
    
    displayEncyclopediaResults({ [type]: data }, title);
  } catch (error) {
    console.error('❌ Filter error:', error);
  }
};

window.applyAdvancedFilters = async function() {
  try {
    const itemType = document.getElementById('filter-item-type').value;
    const itemClass = document.getElementById('filter-class').value;
    const levelMin = document.getElementById('filter-level-min').value;
    const levelMax = document.getElementById('filter-level-max').value;
    const sortBy = document.getElementById('filter-sort-by').value;
    const sortOrder = document.getElementById('filter-sort-order').value;
    const titleFilter = document.getElementById('filter-title').value;
    
    // Boolean filters
    const legendaryOnly = document.getElementById('filter-legendary').checked;
    const dropsOnly = document.getElementById('filter-drops').checked;
    const craftableOnly = document.getElementById('filter-craftable').checked;
    const recipesOnly = document.getElementById('filter-recipes').checked;
    
    const filters = {
      type: itemType,
      class: itemClass,
      levelMin: levelMin ? parseInt(levelMin) : null,
      levelMax: levelMax ? parseInt(levelMax) : null,
      sortBy: sortBy,
      sortOrder: sortOrder,
      titleFilter: titleFilter,
      legendaryOnly: legendaryOnly,
      dropsOnly: dropsOnly,
      craftableOnly: craftableOnly,
      recipesOnly: recipesOnly
    };
    
    const data = await ipcRenderer.invoke('get-encyclopedia-items', filters);
    displayEncyclopediaResults({ items: data }, `Filtered Items (${data.length})`);
  } catch (error) {
    console.error('Advanced filter error:', error);
  }
};

window.clearAllFilters = function() {
  // Reset all filter inputs
  document.getElementById('filter-item-type').value = '';
  document.getElementById('filter-class').value = '';
  document.getElementById('filter-level-min').value = '';
  document.getElementById('filter-level-max').value = '';
  document.getElementById('filter-sort-by').value = 'name';
  document.getElementById('filter-sort-order').value = 'asc';
  document.getElementById('filter-title').value = '';
  
  // Uncheck all checkboxes
  document.getElementById('filter-legendary').checked = false;
  document.getElementById('filter-drops').checked = false;
  document.getElementById('filter-craftable').checked = false;
  document.getElementById('filter-recipes').checked = false;
  
  // Load all items without filters
  loadAllEncyclopediaData();
};

window.quickFilter = function(type) {
  // Quick filter buttons for common types
  clearAllFilters();
  
  switch(type) {
    case 'weapons':
      document.getElementById('filter-item-type').value = 'Weapon';
      break;
    case 'armor':
      document.getElementById('filter-item-type').value = 'armor';
      break;
    case 'shields':
      document.getElementById('filter-item-type').value = 'Shield';
      break;
    case 'helmets':
      document.getElementById('filter-item-type').value = 'Helm';
      break;
    case 'bodyarmor':
      document.getElementById('filter-item-type').value = 'Body Armor';
      break;
    case 'boots':
      document.getElementById('filter-item-type').value = 'Boots';
      break;
    case 'accessories':
      // Filter for all accessory types
      document.getElementById('filter-item-type').value = 'accessories';
      break;
    case 'legendary':
      document.getElementById('filter-legendary').checked = true;
      break;
    case 'recipes':
      document.getElementById('filter-recipes').checked = true;
      break;
  }
  
  applyAdvancedFilters();
};

window.showItemDetails = async function(itemId) {
  console.log('🔍 showItemDetails called with itemId:', itemId);
  console.log('📚 encyclopediaData:', encyclopediaData);
  console.log('📦 encyclopediaData.items:', encyclopediaData?.items);
  console.log('📦 Total items loaded:', encyclopediaData?.items?.length || 0);
  
  // Find the item in the current encyclopedia data
  const item = encyclopediaData?.items?.find(i => i.id === itemId);
  if (!item) {
    console.error('❌ Item not found:', itemId);
    console.error('Available items:', encyclopediaData?.items?.map(i => ({ id: i.id, name: i.name })));
    return;
  }
  
  console.log('✅ Item found:', item);
  console.log('🔍 Item properties:', {
    name: item.name,
    id: item.id,
    isLegendary: item.isLegendary,
    isCraftable: item.isCraftable,
    type: item.type
  });
  
  // Get dependency data if available (for craftable legendary items)
  let dependencyData = null;
  let flatDependencies = null;
  if (item.isCraftable && item.isLegendary) {
    try {
      console.log('🔍 Fetching dependencies for:', item.name);
      console.log('🔍 Item properties:', { isCraftable: item.isCraftable, isLegendary: item.isLegendary });
      const response = await ipcRenderer.invoke('get-dependencies', item.name);
      console.log('✅ Dependency response received:', response);
      
      if (response && response.item) {
        dependencyData = response.item;
        flatDependencies = response.flatDependencies;
        
        // Make flat dependencies available globally for the tree renderer
        window.flatDependencies = flatDependencies;
        
        console.log('📊 Dependency structure:', {
          hasChildren: !!dependencyData.children,
          childrenCount: dependencyData.children?.length || 0,
          complexity: dependencyData.complexity,
          flatDependenciesCount: Object.keys(flatDependencies || {}).length
        });
        
        console.log('🔍 Dependency data details:', {
          item: dependencyData,
          flatDependencies: flatDependencies
        });
      } else {
        console.log('❌ No dependency data found for:', item.name);
        console.log('Response was:', response);
      }
    } catch (error) {
      console.error('❌ Error fetching dependencies:', error);
    }
  } else {
    console.log('⚠️ Item is not craftable or legendary:', { 
      name: item.name, 
      isCraftable: item.isCraftable, 
      isLegendary: item.isLegendary 
    });
  }
  
  // Create and show modal
  console.log('🔨 Creating modal for item:', item.name);
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.onclick = () => {
    console.log('🔄 Modal clicked, removing...');
    modal.remove();
  };
  
  const modalContent = document.createElement('div');
  modalContent.className = 'bg-rpg-dark border-2 border-rpg-gold rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto';
  modalContent.onclick = (e) => {
    console.log('🔄 Modal content clicked, stopping propagation');
    e.stopPropagation();
  };
  
  // Build dependency tree HTML if available
  let dependencyHtml = '';
  if (dependencyData && dependencyData.children && dependencyData.children.length > 0) {
    console.log('🔨 Building dependency HTML for:', item.name);
    
    dependencyHtml = `
      <div class="mt-6 border-t border-rpg-gold/30 pt-4">
        <h4 class="text-lg font-bold text-rpg-gold mb-3">🔗 Crafting Dependencies</h4>
        <div class="bg-rpg-darker p-4 rounded-lg">
          <div class="flex justify-between items-center mb-3">
            <span class="text-sm text-gray-400">Complexity: <span class="text-blue-400 font-bold">${dependencyData.complexity || 'N/A'}</span></span>
            <span class="text-sm text-gray-400">Recipe: <span class="text-green-400">${flatDependencies && dependencyData.children && dependencyData.children[0] ? (flatDependencies[dependencyData.children[0]]?.name || 'Unknown Recipe') : 'Unknown Recipe'}</span></span>
          </div>
          
          <div class="mb-4">
            <h5 class="text-md font-bold text-rpg-gold mb-2">Complete Crafting Tree:</h5>
            <div class="text-sm text-gray-400 text-center py-2 mb-3">
              This shows all materials needed at every level of crafting
            </div>
          </div>
          
          <div class="mb-4">
            <h5 class="text-md font-bold text-rpg-gold mb-2">Dependency Tree Structure:</h5>
            <div class="bg-rpg-darker p-4 rounded-lg max-h-80 overflow-y-auto">
              ${dependencyData ? window.renderDependencyTreeFlat(dependencyData, 0) : '<div class="text-gray-400 text-center py-4">No dependency tree available</div>'}
            </div>
          </div>
          
          <div class="mb-4">
            <h5 class="text-md font-bold text-rpg-gold mb-2">Material Summary:</h5>
            <div class="bg-rpg-darker p-4 rounded-lg">
              ${(() => {
                if (!dependencyData || !flatDependencies) return '<div class="text-gray-400 text-center py-4">No summary available</div>';
                
                const summary = window.calculateQuantitiesFromRecipes(dependencyData);
                if (!summary || Object.keys(summary).length === 0) {
                  return '<div class="text-gray-400 text-center py-4">No materials to summarize</div>';
                }
                
                // Calculate total counts
                const totalCounts = {};
                Object.entries(summary).forEach(([type, items]) => {
                  totalCounts[type] = items.reduce((sum, item) => sum + item.quantity, 0);
                });
                
                const totalUnique = Object.values(summary).reduce((sum, items) => sum + items.length, 0);
                const totalMaterials = Object.values(totalCounts).reduce((sum, count) => sum + count, 0);
                
                return `
                  <div class="mb-4 p-3 bg-rpg-dark rounded border border-rpg-gold/30">
                    <div class="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <div class="text-lg font-bold text-rpg-gold">${totalUnique}</div>
                        <div class="text-xs text-gray-400">Unique Items</div>
                      </div>
                      <div>
                        <div class="text-lg font-bold text-rpg-gold">${totalMaterials}</div>
                        <div class="text-xs text-gray-400">Total Materials</div>
                      </div>
                    </div>
                  </div>
                  
                  ${Object.entries(summary).map(([type, items]) => `
                    <div class="mb-3">
                      <h6 class="text-sm font-bold text-rpg-gold mb-2">${type} (${items.length} unique, ${totalCounts[type]} total)</h6>
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                        ${items.map(item => `
                          <div class="flex items-center space-x-2 p-2 bg-rpg-dark rounded border border-rpg-gold/20">
                            ${item.image_url ? 
                              `<img src="${item.image_url}" alt="${item.name}" class="w-8 h-8 object-contain rounded">` : 
                              `<div class="w-8 h-8 bg-gray-700 rounded flex items-center justify-center">
                                <span class="text-xs text-gray-400">${item.type?.charAt(0)?.toUpperCase() || '?'}</span>
                              </div>`
                            }
                            <div class="flex-1">
                              <span class="text-sm text-gray-300">${item.name}</span>
                              <span class="text-xs text-gray-400 block">(${item.nodeType})</span>
                              ${item.type && item.type !== 'Unknown' ? 
                                `<span class="text-xs text-gray-500 block">${item.type}</span>` : ''
                              }
                            </div>
                            <span class="text-sm font-bold text-rpg-gold bg-rpg-dark px-2 py-1 rounded border border-rpg-gold/30">×${item.quantity}</span>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  `).join('')}
                `;
              })()}
            </div>
          </div>
          
          <div>
            <h5 class="text-md font-bold text-rpg-gold mb-2">Direct Recipe Ingredients:</h5>
            <div class="space-y-3">
              ${flatDependencies && dependencyData.children && dependencyData.children.length > 0 ? 
                (() => {
                  // Get the first child (recipe ID)
                  const recipeId = dependencyData.children[0];
                  const recipe = flatDependencies[recipeId];
                  
                  if (recipe && recipe.children && recipe.children.length > 0) {
                    return recipe.children.map(ingredientId => {
                      const ingredient = flatDependencies[ingredientId];
                      if (!ingredient) return '';
                      
                      return `
                        <div class="p-3 bg-rpg-dark rounded border border-rpg-gold/20">
                          <div class="flex justify-between items-start mb-2">
                            <span class="text-sm font-bold text-gray-300">${ingredient.name || 'Unknown Ingredient'}</span>
                            <div class="flex items-center space-x-2">
                              ${ingredient.isLegendary ? '<span class="text-yellow-400 text-xs">⭐ Legendary</span>' : ''}
                              <span class="text-xs px-2 py-1 rounded ${(ingredient.nodeType || 'unknown') === 'title' ? 'bg-orange-500' : (ingredient.nodeType || 'unknown') === 'base_item' ? 'bg-green-500' : 'bg-gray-500'} text-white">${(ingredient.nodeType || 'unknown').replace('_', ' ')}</span>
                            </div>
                          </div>
                          <div class="text-xs text-gray-400">
                            <div>Type: ${ingredient.nodeType || 'unknown'}</div>
                            ${ingredient.children && ingredient.children.length > 0 ? `
                              <div class="mt-2">
                                <div class="text-purple-400 font-bold">Sub-components: ${ingredient.children.length}</div>
                                ${ingredient.children.map(childId => {
                                  const child = flatDependencies[childId];
                                  return `<div class="ml-2">• ${child ? child.name : 'Unknown'} (${child ? child.nodeType : 'unknown'})</div>`;
                                }).join('')}
                              </div>
                            ` : ''}
                          </div>
                        </div>
                      `;
                    }).join('');
                  } else {
                    return '<div class="text-gray-400 text-center py-4">No recipe ingredients found</div>';
                  }
                })() : '<div class="text-gray-400 text-center py-4">No recipe data available</div>'
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  modalContent.innerHTML = `
    <div class="flex justify-between items-start mb-4">
      <h3 class="text-2xl font-bold text-rpg-gold">${item.name}</h3>
      <button onclick="this.closest('.fixed').remove()" class="text-rpg-gold hover:text-white text-2xl">✕</button>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="text-center">
        <img src="${item.image_url}" alt="${item.name}" class="mx-auto max-w-32 max-h-32 object-contain mb-4">
        ${item.isLegendary ? '<div class="text-yellow-400 text-lg font-bold">⭐ Legendary Item</div>' : ''}
      </div>
      
      <div class="space-y-4">
        <div>
          <h4 class="text-lg font-bold text-rpg-gold mb-2">Basic Info</h4>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-400">Type:</span>
              <span class="text-rpg-gold">${item.type}</span>
            </div>
            ${item.requirements.Class ? `
              <div class="flex justify-between">
                <span class="text-gray-400">Class:</span>
                <span class="text-rpg-gold">${item.requirements.Class}</span>
              </div>
            ` : ''}
            ${item.requirements.Level ? `
              <div class="flex justify-between">
                <span class="text-gray-400">Level:</span>
                <span class="text-rpg-gold">${item.requirements.Level}</span>
              </div>
            ` : ''}
            ${item.requirements.Dexterity ? `
              <div class="flex justify-between">
                <span class="text-gray-400">Dexterity:</span>
                <span class="text-rpg-gold">${item.requirements.Dexterity}</span>
              </div>
            ` : ''}
          </div>
        </div>
        
        ${Object.keys(item.attributes).length > 0 ? `
          <div>
            <h4 class="text-lg font-bold text-rpg-gold mb-2">Attributes</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              ${Object.entries(item.attributes).map(([key, value]) => `
                <div class="flex justify-between">
                  <span class="text-gray-400">${key}:</span>
                  <span class="text-rpg-gold">${typeof value === 'number' && key !== 'DamageMin' && key !== 'DamageMax' ? '+' : ''}${value}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        <hr/>
        ${Object.keys(item.requirements).length > 0 ? `
          <div>
            <h4 class="text-lg font-bold text-rpg-gold mb-2">Requirements</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              ${Object.entries(item.requirements).map(([key, value]) => `
                <div class="flex justify-between">
                  <span class="text-gray-400">${key}:</span>
                  <span class="text-rpg-gold">${typeof value === 'number' && key !== 'DamageMin' && key !== 'DamageMax' ? '+' : ''}${value}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="flex flex-wrap gap-2">
          ${item.isDrop ? '<span class="bg-red-500 text-white px-3 py-1 rounded-full text-sm">Drop Item</span>' : ''}
          ${item.isCraftable ? '<span class="bg-blue-500 text-white px-3 py-1 rounded-full text-sm">Craftable</span>' : ''}
          ${item.type === 'Recipe' ? '<span class="text-green-500 text-white px-3 py-1 rounded-full text-sm">Recipe</span>' : ''}
        </div>
        
        ${item.description ? `
          <div>
            <h4 class="text-lg font-bold text-rpg-gold mb-2">Description</h4>
            <p class="text-gray-300 text-sm">${item.description}</p>
          </div>
        ` : ''}
        
        ${item.ingredients && item.ingredients.length > 0 ? `
          <div>
            <h4 class="text-lg font-bold text-rpg-gold mb-2">Ingredients</h4>
            <div class="text-sm text-gray-300">
              ${item.ingredients.map(ingredient => `<div>• ${ingredient}</div>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
    
    ${dependencyHtml}
    
    ${!dependencyData && item.isCraftable && item.isLegendary ? `
      <div class="mt-6 border-t border-rpg-gold/30 pt-4">
        <div class="text-center text-gray-400">
          <p>🔗 Dependency analysis not available for this item.</p>
          <p class="text-sm">Run "Analyze Dependencies" to generate crafting trees.</p>
        </div>
      </div>
    ` : ''}
    
    ${dependencyData && (!dependencyData.children || dependencyData.children.length === 0) ? `
      <div class="mt-6 border-t border-rpg-gold/30 pt-4">
        <div class="text-center text-gray-400">
          <p>🔗 Dependency data incomplete for this item.</p>
          <p class="text-sm">Try regenerating dependencies or check the data structure.</p>
        </div>
      </div>
    ` : ''}
  `;
  
  console.log('🔍 Final modal HTML length:', modalContent.innerHTML.length);
  console.log('🔍 Modal content preview:', modalContent.innerHTML.substring(0, 200) + '...');
  
  // Check if modal content is valid
  if (!modalContent.innerHTML || modalContent.innerHTML.length < 100) {
    console.error('❌ Modal content is too short or empty!');
    console.error('Modal HTML:', modalContent.innerHTML);
    return;
  }
  
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
  
  console.log('✅ Modal created and added to DOM');
  console.log('🔍 Modal element:', modal);
  console.log('🔍 Modal content:', modalContent);
  console.log('🔍 Modal HTML length:', modalContent.innerHTML.length);
  
  // Verify modal is visible
  setTimeout(() => {
    const modalElement = document.querySelector('.fixed');
    if (modalElement) {
      console.log('✅ Modal found in DOM:', modalElement);
      console.log('🔍 Modal styles:', window.getComputedStyle(modalElement));
    } else {
      console.error('❌ Modal not found in DOM after creation!');
    }
  }, 100);
};

window.exportFilteredResults = function() {
  // Get current filtered results from the display
  const contentSection = document.getElementById('encyclopedia-content');
  if (!contentSection) return;
  
  const title = contentSection.querySelector('h3')?.textContent || 'Encyclopedia Data';
  const items = encyclopediaData?.items || [];
  
  // Create CSV content
  let csv = 'Name,Type,Class,Level,Damage,Armor,Health,Mana,Dexterity,Wisdom,Legendary,Drop,Craftable,Description\n';
  
  items.forEach(item => {
    const row = [
      `"${item.name}"`,
      item.type,
      item.attributes?.DamageMin ? `${item.attributes.DamageMin}-${item.attributes.DamageMax || item.attributes.DamageMin}` : '',
      item.attributes?.Armor || '',
      item.attributes?.Health || '',
      item.attributes?.Mana || '',
      item.attributes?.Stamina || '',
      item.attributes?.Strength || '',
      item.attributes?.Dexterity || '',
      item.attributes?.Endurance || '',
      item.attributes?.Wisdom || '',
      item.requirements?.Class || '',
      item.requirements?.Level || '',
      item.requirements?.Strength || '',
      item.requirements?.Dexterity || '',
      item.requirements?.Endurance || '',
      item.requirements?.Wisdom || '',
      item.isLegendary ? 'Yes' : 'No',
      item.isDrop ? 'Yes' : 'No',
      item.isCraftable ? 'Yes' : 'No',
      `"${item.description || ''}"`
    ];
    csv += row.join(',') + '\n';
  });
  
  // Download CSV file
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

window.renderDependencyTree = function(node, level = 0) {
  if (!node) return '';
  
  const nodeTypeColor = {
    'item': 'text-rpg-gold',
    'recipe': 'text-red-400',
    'titled_item': 'text-blue-400',
    'base_item': 'text-green-400',
    'craftable_item': 'text-purple-400',
    'title': 'text-orange-400',
    'unknown': 'text-gray-400'
  };
  
  let html = `
    <div class="mb-1" style="margin-left: ${level * 20}px;">
      <span class="text-xs ${nodeTypeColor[node.nodeType] || 'text-gray-400'}">${node.name}</span>
      <span class="text-xs text-gray-500">(${node.nodeType})</span>
      ${node.isLegendary ? '<span class="text-yellow-400 text-xs">⭐</span>' : ''}
    </div>
  `;
  
  // Recursively render children
  if (node.children && node.children.length > 0) {
    node.children.forEach(child => {
      html += window.renderDependencyTree(child, level + 1);
    });
  }
  
  return html;
};

// New function for flat dependency structure - recursively shows all nested children with collapsible sections
window.renderDependencyTreeFlat = function(node, level = 0, nodeId = null) {
  if (!node) return '';
  
  const nodeTypeColor = {
    'item': 'text-rpg-gold',
    'recipe': 'text-red-400',
    'titled_item': 'text-blue-400',
    'base_item': 'text-green-400',
    'craftable_item': 'text-purple-400',
    'title': 'text-orange-400',
    'unknown': 'text-gray-400'
  };
  
  // Get the actual encyclopedia item or title data for images and details
  const encyclopediaItem = window.getEncyclopediaItemByName(node.name);
  const encyclopediaTitle = window.getEncyclopediaTitleByName(node.name);
  const encyclopediaData = encyclopediaItem || encyclopediaTitle;
  
  // Generate unique ID for this node
  const uniqueId = nodeId || `node_${level}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Check if this node has children
  const hasChildren = node.children && node.children.length > 0;
  
  // Determine if this node should be expandable
  const isExpandable = hasChildren && (
    node.nodeType === 'recipe' || 
    node.nodeType === 'base_item' || 
    node.nodeType === 'item'
  );
  
  // Debug logging for expandable nodes
  if (isExpandable) {
    console.log(`🔍 Node "${node.name}" (${node.nodeType}) is expandable with ${node.children.length} children`);
  }
  
  let html = `
    <div class="mb-2" style="margin-left: ${level * 20}px;">
      <div class="flex items-center space-x-2 p-2 bg-rpg-darker rounded border border-rpg-gold/20">
        ${isExpandable ? `
          <button onclick="toggleNode('${uniqueId}')" class="toggle-btn text-rpg-gold hover:text-rpg-gold/80">
            <span id="icon_${uniqueId}" class="text-sm">▶</span>
          </button>
        ` : '<div class="w-4"></div>'}
        
        ${encyclopediaData && encyclopediaData.image_url ? 
          `<img src="${encyclopediaData.image_url}" alt="${node.name}" class="w-[50px] h-[50px] object-contain rounded border border-rpg-gold/30">` : 
          `<div class="w-[50px] h-[50px] bg-gray-700 rounded border border-rpg-gold/30 flex items-center justify-center">
            <span class="text-xs text-gray-400">${node.nodeType?.charAt(0)?.toUpperCase() || '?'}</span>
          </div>`
        }
        
        <div class="flex-1">
          <div class="flex items-center space-x-2">
            <span class="text-sm font-bold ${nodeTypeColor[node.nodeType] || 'text-gray-400'}">${node.name}</span>
            <span class="text-xs px-2 py-1 rounded bg-gray-600 text-white">${(node.nodeType || 'unknown').replace('_', ' ')}</span>
            ${node.isLegendary ? '<span class="text-yellow-400 text-xs">⭐</span>' : ''}
            ${isExpandable ? '<span class="text-xs px-2 py-1 rounded bg-blue-600 text-white">📁</span>' : ''}
          </div>
          ${encyclopediaData && encyclopediaData.type ? 
            `<div class="text-xs text-gray-400">Type: ${encyclopediaData.type}</div>` : 
            encyclopediaData && encyclopediaData.prefix ? 
            `<div class="text-xs text-gray-400">Title: ${encyclopediaData.prefix}</div>` : ''
          }
        </div>
      </div>
    </div>
  `;
  
  // Special handling for recipes to show titled items
  if (node.nodeType === 'recipe' && hasChildren) {
    // First level (recipe ingredients) should be visible by default
    const containerClass = '';
    const iconText = '▼';
    
    html += `
      <div id="children_${uniqueId}" class="${containerClass}" style="margin-left: ${(level + 1) * 20}px;">
    `;
    
    // For recipes, we need to group children into titled items
    console.log(`🔍 Recipe ${node.name} has ${node.children.length} children:`, node.children);
    console.log(`🔍 Children data:`, node.children.map(id => window.flatDependencies[id]).filter(Boolean));
    
    const titledItems = window.groupRecipeIngredients(node.children);
    console.log(`🔍 Grouped into ${titledItems.length} titled items:`, titledItems);
    
    titledItems.forEach((titledItem, index) => {
      const titledItemId = `titled_${uniqueId}_${index}`;
      
      // Create titled item node
      html += `
        <div class="mb-2">
          <div class="flex items-center space-x-2 p-2 bg-blue-900/20 rounded border border-blue-500/30">
            <button onclick="toggleNode('${titledItemId}')" class="toggle-btn text-blue-400 hover:text-blue-300">
              <span id="icon_${titledItemId}" class="text-sm">▼</span>
            </button>
            
            ${(() => {
              // Use base item image for titled items
              const baseItemData = window.getEncyclopediaItemByName(titledItem.baseItem);
              return baseItemData && baseItemData.image_url ? 
                `<img src="${baseItemData.image_url}" alt="${titledItem.name}" class="w-[50px] h-[50px] object-contain rounded border border-blue-500/30">` : 
                `<div class="w-[50px] h-[50px] bg-blue-800/30 rounded border border-blue-500/30 flex items-center justify-center">
                  <span class="text-xs text-blue-300">TI</span>
                </div>`;
            })()}
            
            <div class="flex-1">
              <div class="flex items-center space-x-2">
                <span class="text-sm font-bold text-blue-400">${titledItem.name}</span>
                <span class="text-xs px-2 py-1 rounded bg-blue-600 text-white">Titled Item</span>

              </div>
              <div class="text-xs text-blue-300">Recipe Ingredient</div>
            </div>
          </div>
          
          <div id="children_${titledItemId}" class="" style="margin-left: 20px;">
            ${titledItem.title ? `
              <div class="mb-2">
                <div class="flex items-center space-x-2 p-2 bg-orange-900/20 rounded border border-orange-500/30">
                  <div class="w-4"></div>
                  ${(() => {
                    const titleData = window.getEncyclopediaTitleByName(titledItem.title);
                    return titleData && titleData.image_url ? 
                      `<img src="${titleData.image_url}" alt="${titledItem.title}" class="w-[50px] h-[50px] object-contain rounded border border-orange-500/30">` : 
                      `<div class="w-[50px] h-[50px] bg-orange-800/30 rounded border border-orange-500/30 flex items-center justify-center">
                        <span class="text-xs text-orange-300">T</span>
                      </div>`;
                  })()}
                  <div class="flex-1">
                    <span class="text-sm font-bold text-orange-400">${titledItem.title}</span>
                    <span class="text-xs px-2 py-1 rounded bg-orange-600 text-white">Title</span>

                  </div>
                </div>
              </div>
            ` : ''}
            
            ${titledItem.baseItem ? `
              <div class="mb-2">
                <div class="flex items-center space-x-2 p-2 bg-green-900/20 rounded border border-green-500/30">
                  ${(() => {
                    // Check if this base item has children (like a recipe)
                    const baseItemRecord = window.flatDependencies[titledItem.baseItemId];
                    const hasChildren = baseItemRecord && baseItemRecord.children && baseItemRecord.children.length > 0;
                    const isExpandable = hasChildren && (
                      baseItemRecord.nodeType === 'recipe' || 
                      baseItemRecord.nodeType === 'base_item' || 
                      baseItemRecord.nodeType === 'item'
                    );
                    
                    return isExpandable ? `
                      <button onclick="toggleNode('${titledItemId}_base')" class="toggle-btn text-green-400 hover:text-green-300">
                        <span id="icon_${titledItemId}_base" class="text-sm">▶</span>
                      </button>
                    ` : '<div class="w-4"></div>';
                  })()}
                  
                  ${(() => {
                    const baseItemData = window.getEncyclopediaItemByName(titledItem.baseItem);
                    return baseItemData && baseItemData.image_url ? 
                      `<img src="${baseItemData.image_url}" alt="${titledItem.baseItem}" class="w-[50px] h-[50px] object-contain rounded border border-green-500/30">` : 
                      `<div class="w-[50px] h-[50px] bg-green-800/30 rounded border border-green-500/30 flex items-center justify-center">
                        <span class="text-xs text-green-300">B</span>
                      </div>`;
                  })()}
                  
                  <div class="flex-1">
                    <span class="text-sm font-bold text-green-400">${titledItem.baseItem}</span>
                    <span class="text-xs px-2 py-1 rounded bg-green-600 text-white">Base Item</span>
                    ${(() => {
                      const baseItemData = window.getEncyclopediaItemByName(titledItem.baseItem);
                      return baseItemData && baseItemData.type ? 
                        `<div class="text-xs text-green-300">Type: ${baseItemData.type}</div>` : '';
                    })()}
                    ${(() => {
                      const baseItemRecord = window.flatDependencies[titledItem.baseItemId];
                      const hasChildren = baseItemRecord && baseItemRecord.children && baseItemRecord.children.length > 0;
                      return hasChildren ? `<span class="text-xs px-2 py-1 rounded bg-blue-600 text-white">📁</span>` : '';
                    })()}
                  </div>
                </div>
                
                ${(() => {
                  // Add children container for base item if it has children
                  const baseItemRecord = window.flatDependencies[titledItem.baseItemId];
                  const hasChildren = baseItemRecord && baseItemRecord.children && baseItemRecord.children.length > 0;
                  
                  if (hasChildren) {
                    return `
                      <div id="children_${titledItemId}_base" class="hidden" style="margin-left: 20px;">
                        ${(() => {
                          // Recursively render the base item's children
                          let childrenHtml = '';
                          baseItemRecord.children.forEach(childId => {
                            const childRecord = window.flatDependencies[childId];
                            if (childRecord) {
                              childrenHtml += window.renderDependencyTreeFlat(childRecord, level + 2, `base_${titledItemId}_${childId}`);
                            }
                          });
                          return childrenHtml;
                        })()}
                      </div>
                    `;
                  }
                  return '';
                })()}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    });
    
    html += `</div>`;
    
    // Update the icon to show correct state
    html = html.replace(`id="icon_${uniqueId}" class="text-sm">▶`, `id="icon_${uniqueId}" class="text-sm">${iconText}`);
    
  } else if (hasChildren) {
    // Handle all expandable nodes (recipes, base items, items)
    const containerClass = 'hidden';
    const iconText = '▶';
    
    console.log(`🔍 Generic handler for ${node.nodeType} "${node.name}" with ${node.children.length} children`);
    console.log(`  Creating children container: children_${uniqueId}`);
    console.log(`  Container class: ${containerClass}`);
    
    html += `
      <div id="children_${uniqueId}" class="${containerClass}" style="margin-left: ${(level + 1) * 20}px;">
    `;
    
    // Recursively render children by following ID references
    node.children.forEach(childId => {
      console.log(`  🔍 Processing child ID: ${childId}`);
      const childRecord = window.getFlatDependencyRecord(childId);
      if (childRecord) {
        console.log(`  ✅ Found child record: ${childRecord.name} (${childRecord.nodeType})`);
        html += window.renderDependencyTreeFlat(childRecord, level + 1, `child_${uniqueId}_${childId}`);
      } else {
        console.log(`  ❌ Child record not found for ID: ${childId}`);
      }
    });
    
    html += `</div>`;
    
    // Update the icon to show correct state
    html = html.replace(`id="icon_${uniqueId}" class="text-sm">▶`, `id="icon_${uniqueId}" class="text-sm">${iconText}`);
    
    console.log(`  ✅ Created children container for ${node.name}`);
  }
  
  return html;
};

// Helper function to get a dependency record by ID
window.getFlatDependencyRecord = function(recordId) {
  // This will be populated by the main process when loading dependencies
  console.log(`🔍 Looking up dependency record: ${recordId}`);
  console.log(`  Available keys:`, window.flatDependencies ? Object.keys(window.flatDependencies).slice(0, 10) : 'undefined');
  
  if (window.flatDependencies && window.flatDependencies[recordId]) {
    console.log(`  ✅ Found record: ${window.flatDependencies[recordId].name}`);
    return window.flatDependencies[recordId];
  }
  
  console.log(`  ❌ Record not found: ${recordId}`);
  return null;
};

// Helper function to get encyclopedia item by name (for images and details)
window.getEncyclopediaItemByName = function(itemName) {
  if (encyclopediaData && encyclopediaData.items) {
    return encyclopediaData.items.find(item => item.name === itemName);
  }
  return null;
};

// Helper function to get encyclopedia title by name (for titles)
window.getEncyclopediaTitleByName = function(titleName) {
  if (encyclopediaData && encyclopediaData.titles) {
    return encyclopediaData.titles.find(title => title.name === titleName);
  }
  return null;
};

// Helper function to group recipe ingredients into titled items
window.groupRecipeIngredients = function(ingredientIds) {
  if (!ingredientIds || !window.flatDependencies) return [];
  
  console.log('🔍 Grouping recipe ingredients:', ingredientIds);
  console.log('🔍 Available dependencies:', Object.keys(window.flatDependencies));
  
  // Separate titles and base items
  const titles = [];
  const baseItems = [];
  
  ingredientIds.forEach(ingredientId => {
    const ingredient = window.flatDependencies[ingredientId];
    if (!ingredient) {
      console.log(`⚠️ Ingredient not found: ${ingredientId}`);
      return;
    }
    
    console.log(`🔍 Processing ingredient: ${ingredient.name} (${ingredient.nodeType})`);
    
    if (ingredient.nodeType === 'title') {
      titles.push({ id: ingredientId, ...ingredient });
    } else if (ingredient.nodeType === 'base_item' || ingredient.nodeType === 'item') {
      baseItems.push({ id: ingredientId, ...ingredient });
    } else {
      console.log(`⚠️ Unknown ingredient type: ${ingredient.nodeType} for ${ingredient.name}`);
    }
  });
  
  console.log(`🔍 Found ${titles.length} titles:`, titles.map(t => t.name));
  console.log(`🔍 Found ${baseItems.length} base items:`, baseItems.map(b => b.name));
  
  // Pair titles with base items in order
  const titledItems = [];
  
  console.log(`🔍 Creating titled item pairs...`);
  console.log(`  Titles: ${titles.length}, Base Items: ${baseItems.length}`);
  
  // Handle different pairing scenarios
  if (titles.length === 0 && baseItems.length > 0) {
    // No titles, just base items
    baseItems.forEach((baseItem, index) => {
      console.log(`  Base item ${index + 1}: "${baseItem.name}" (no title)`);
      titledItems.push({
        name: baseItem.name,
        title: null,
        baseItem: baseItem.name,
        titleId: null,
        baseItemId: baseItem.id,
        index: index
      });
    });
  } else if (titles.length > 0 && baseItems.length === 0) {
    // Only titles, no base items
    titles.forEach((title, index) => {
      console.log(`  Title ${index + 1}: "${title.name}" (no base item)`);
      titledItems.push({
        name: title.name,
        title: title.name,
        baseItem: null,
        titleId: title.id,
        baseItemId: null,
        index: index
      });
    });
  } else if (titles.length > 0 && baseItems.length > 0) {
    // Both titles and base items - pair them
    const maxPairs = Math.min(titles.length, baseItems.length);
    
    for (let i = 0; i < maxPairs; i++) {
      const title = titles[i];
      const baseItem = baseItems[i];
      
      console.log(`  Pair ${i + 1}: Title "${title.name}" + Base Item "${baseItem.name}"`);
      
      // Create titled item: "prefix + item name + suffix" format
      let titledItemName = baseItem.name;
      
      // Get the actual title data to access prefix and suffix
      const titleData = window.getEncyclopediaTitleByName(title.name);
      if (titleData) {
        if (titleData.prefix && titleData.suffix) {
          titledItemName = `${titleData.prefix} ${baseItem.name} ${titleData.suffix}`;
        } else if (titleData.prefix) {
          titledItemName = `${titleData.prefix} ${baseItem.name}`;
        } else if (titleData.suffix) {
          titledItemName = `${baseItem.name} ${titleData.suffix}`;
        }
      } else {
        // Fallback to old format if title data not found
        titledItemName = `${title.name}'s ${baseItem.name}`;
      }
      
      console.log(`✅ Created titled item ${i + 1}: ${titledItemName}`);
      
      titledItems.push({
        name: titledItemName,
        title: title.name,
        baseItem: baseItem.name,
        titleId: title.id,
        baseItemId: baseItem.id,
        index: i
      });
    }
    
    // Handle remaining unpaired items
    if (titles.length > maxPairs) {
      titles.slice(maxPairs).forEach((title, index) => {
        console.log(`⚠️ Unpaired title: ${title.name}`);
        titledItems.push({
          name: title.name,
          title: title.name,
          baseItem: null,
          titleId: title.id,
          baseItemId: null,
          index: maxPairs + index
        });
      });
    }
    
    if (baseItems.length > maxPairs) {
      baseItems.slice(maxPairs).forEach((baseItem, index) => {
        console.log(`⚠️ Unpaired base item: ${baseItem.name}`);
        titledItems.push({
          name: baseItem.name,
          title: null,
          baseItem: baseItem.name,
          titleId: null,
          baseItemId: baseItem.id,
          index: maxPairs + index
        });
      });
    }
  }
  

  
  console.log(`📊 Final titled items:`, titledItems);
  return titledItems;
};

// Helper function to calculate material summary recursively with quantities
window.calculateMaterialSummary = function(node, visited = new Set(), parentQuantity = 1) {
  if (!node || visited.has(node.id)) return {};
  
  visited.add(node.id);
  const summary = {};
  
  // Add current node to summary with proper quantity
  const type = node.nodeType || 'unknown';
  if (!summary[type]) summary[type] = [];
  
  // Get encyclopedia item or title for image and details
  const encyclopediaItem = window.getEncyclopediaItemByName(node.name);
  const encyclopediaTitle = window.getEncyclopediaTitleByName(node.name);
  const encyclopediaData = encyclopediaItem || encyclopediaTitle;
  
  const summaryItem = {
    id: node.id,
    name: node.name,
    nodeType: node.nodeType,
    type: encyclopediaData?.type || encyclopediaData?.prefix || 'Unknown',
    image_url: encyclopediaData?.image_url || null,
    isLegendary: node.isLegendary || false,
    quantity: parentQuantity
  };
  
  // Check if item already exists in summary and add quantities
  const existingIndex = summary[type].findIndex(item => item.name === node.name);
  if (existingIndex === -1) {
    summary[type].push(summaryItem);
  } else {
    summary[type][existingIndex].quantity += parentQuantity;
  }
  
  // Recursively process children with proper quantity accumulation
  if (node.children && node.children.length > 0) {
    // For recipes, count how many times each ingredient appears
    if (node.nodeType === 'recipe') {
      const ingredientCounts = {};
      node.children.forEach(childId => {
        ingredientCounts[childId] = (ingredientCounts[childId] || 0) + 1;
      });
      
      // Process each child with its count
      Object.entries(ingredientCounts).forEach(([childId, count]) => {
        const childRecord = window.getFlatDependencyRecord(childId);
        if (childRecord) {
          const childQuantity = parentQuantity * count;
          const childSummary = window.calculateQuantitiesFromRecipes(childRecord, visited, childQuantity);
          // Merge child summary into parent summary
          Object.entries(childSummary).forEach(([childType, childItems]) => {
            if (!summary[childType]) summary[childType] = [];
            childItems.forEach(childItem => {
              const existingIndex = summary[childType].findIndex(item => item.name === childItem.name);
              if (existingIndex === -1) {
                summary[childType].push(childItem);
              } else {
                summary[childType][existingIndex].quantity += (childItem.quantity || 1);
              }
            });
          });
        }
      });
    } else {
      // For non-recipe nodes, process children normally
      node.children.forEach(childId => {
        const childRecord = window.getFlatDependencyRecord(childId);
        if (childRecord) {
          const childSummary = window.calculateQuantitiesFromRecipes(childRecord, visited, parentQuantity);
          // Merge child summary into parent summary
          Object.entries(childSummary).forEach(([childType, childItems]) => {
            if (!summary[childType]) summary[childType] = [];
            childItems.forEach(childItem => {
              const existingIndex = summary[childType].findIndex(item => item.name === childItem.name);
              if (existingIndex === -1) {
                summary[childType].push(childItem);
              } else {
                summary[childType][existingIndex].quantity += (childItem.quantity || 1);
              }
            });
          });
        }
      });
    }
  }
  
  return summary;
};

// New function to calculate quantities based on recipe ingredient counts
window.calculateQuantitiesFromRecipes = function(node, visited = new Set(), parentQuantity = 1) {
  if (!node) return {};
  
  // For material summary, we want to count all instances, even if they appear in different branches
  // So we don't use visited.has(node.id) check for the main logic
  // const nodeKey = `${node.id}_${parentQuantity}`;
  // if (visited.has(nodeKey)) return {};
  // visited.add(nodeKey);
  const summary = {};
  
  // Add current node to summary with parent quantity
  const type = node.nodeType || 'unknown';
  if (!summary[type]) summary[type] = [];
  
  // Get encyclopedia item or title for image and details
  const encyclopediaItem = window.getEncyclopediaItemByName(node.name);
  const encyclopediaTitle = window.getEncyclopediaTitleByName(node.name);
  const encyclopediaData = encyclopediaItem || encyclopediaTitle;
  
  const summaryItem = {
    id: node.id,
    name: node.name,
    nodeType: node.nodeType,
    type: encyclopediaData?.type || encyclopediaData?.prefix || 'Unknown',
    image_url: encyclopediaData?.image_url || null,
    isLegendary: node.isLegendary || false,
    quantity: parentQuantity
  };
  
  // Check if item already exists in summary and add quantities
  const existingIndex = summary[type].findIndex(item => item.name === node.name);
  if (existingIndex === -1) {
    summary[type].push(summaryItem);
  } else {
    summary[type][existingIndex].quantity += parentQuantity;
  }
  
  // Recursively process children
  if (node.children && node.children.length > 0) {
    if (node.nodeType === 'recipe') {
      // For recipes, calculate ingredient quantities based on how many times they appear
      const ingredientCounts = {};
      node.children.forEach(childId => {
        ingredientCounts[childId] = (ingredientCounts[childId] || 0) + 1;
      });
      
      // Process each child with its count
      Object.entries(ingredientCounts).forEach(([childId, count]) => {
        const childRecord = window.getFlatDependencyRecord(childId);
        if (childRecord) {
          const childQuantity = parentQuantity * count;
          console.log(`🍳 Processing ${childRecord.name} with quantity ${childQuantity} (parent: ${parentQuantity} × count: ${count})`);
          const childSummary = window.calculateQuantitiesFromRecipes(childRecord, visited, childQuantity);
          // Merge child summary into parent summary
          Object.entries(childSummary).forEach(([childType, childItems]) => {
            if (!summary[childType]) summary[childType] = [];
            childItems.forEach(childItem => {
              const existingIndex = summary[childType].findIndex(item => item.name === childItem.name);
              if (existingIndex === -1) {
                summary[childType].push(childItem);
              } else {
                summary[childType][existingIndex].quantity += childItem.quantity;
              }
            });
          });
        }
      });
    } else {
      // For non-recipe nodes, process children normally
      node.children.forEach(childId => {
        const childRecord = window.getFlatDependencyRecord(childId);
        if (childRecord) {
          const childSummary = window.calculateQuantitiesFromRecipes(childRecord, visited, parentQuantity);
          // Merge child summary into parent summary
          Object.entries(childSummary).forEach(([childType, childItems]) => {
            if (!summary[childType]) summary[childType] = [];
            childItems.forEach(childItem => {
              const existingIndex = summary[childType].findIndex(item => item.name === childItem.name);
              if (existingIndex === -1) {
                summary[childType].push(childItem);
              } else {
                summary[childType][existingIndex].quantity += childItem.quantity;
              }
            });
          });
        }
      });
    }
  }
  
  return summary;
};

// Function to toggle node expansion/collapse
window.toggleNode = function(nodeId) {
  console.log(`🔍 toggleNode called with ID: ${nodeId}`);
  
  const childrenContainer = document.getElementById(`children_${nodeId}`);
  const icon = document.getElementById(`icon_${nodeId}`);
  
  console.log(`  Children container:`, childrenContainer);
  console.log(`  Icon:`, icon);
  console.log(`  Container ID: children_${nodeId}`);
  console.log(`  Icon ID: icon_${nodeId}`);
  
  if (childrenContainer && icon) {
    const isHidden = childrenContainer.classList.contains('hidden');
    console.log(`  Currently hidden: ${isHidden}`);
    console.log(`  Container classes:`, childrenContainer.className);
    
    if (isHidden) {
      // Remove hidden class and force visibility with !important
      childrenContainer.classList.remove('hidden');
      childrenContainer.style.setProperty('display', 'block', 'important');
      childrenContainer.style.setProperty('visibility', 'visible', 'important');
      childrenContainer.style.setProperty('opacity', '1', 'important');
      childrenContainer.style.setProperty('height', 'auto', 'important');
      childrenContainer.style.setProperty('overflow', 'visible', 'important');
      
      icon.textContent = '▼';
      console.log(`  ✅ Expanded node: ${nodeId}`);
      console.log(`  Container classes after expand:`, childrenContainer.className);
      console.log(`  Forced visibility styles applied`);
    } else {
      // Add hidden class and force hiding with !important
      childrenContainer.classList.add('hidden');
      childrenContainer.style.setProperty('display', 'none', 'important');
      childrenContainer.style.setProperty('visibility', 'hidden', 'important');
      childrenContainer.style.setProperty('opacity', '0', 'important');
      childrenContainer.style.setProperty('height', '0', 'important');
      childrenContainer.style.setProperty('overflow', 'hidden', 'important');
      
      icon.textContent = '▶';
      console.log(`  ✅ Collapsed node: ${nodeId}`);
      console.log(`  Container classes after collapse:`, childrenContainer.className);
      console.log(`  Forced hiding styles applied`);
    }
  } else {
    console.log(`  ❌ Could not find elements for node: ${nodeId}`);
    console.log(`  Available elements with similar IDs:`);
    const allElements = document.querySelectorAll('[id*="' + nodeId + '"]');
    allElements.forEach(el => console.log(`    - ${el.id}: ${el.tagName}`));
  }
};

window.showEncyclopediaStats = function() {
  if (!encyclopediaData) return;
  
  const stats = {
    total: encyclopediaData.items?.length || 0,
    byType: {},
    byClass: {},
    legendary: 0,
    drops: 0,
    craftable: 0,
    recipes: 0
  };
  
  if (encyclopediaData.items) {
    encyclopediaData.items.forEach(item => {
      // Count by type
      stats.byType[item.type] = (stats.byType[item.type] || 0) + 1;
      
      // Count by class
      if (item.requirements?.Class) {
        stats.byClass[item.requirements.Class] = (stats.byClass[item.requirements.Class] || 0) + 1;
      }
      
      // Count special properties
      if (item.isLegendary) stats.legendary++;
      if (item.isDrop) stats.drops++;
      if (item.isCraftable) stats.craftable++;
      if (item.type === 'Recipe') stats.recipes++;
    });
  }
  
  // Create and show stats modal
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.onclick = () => modal.remove();
  
  const modalContent = document.createElement('div');
  modalContent.className = 'bg-rpg-dark border-2 border-rpg-gold rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto';
  modalContent.onclick = (e) => e.stopPropagation();
  
  modalContent.innerHTML = `
    <div class="flex justify-between items-start mb-4">
      <h3 class="text-2xl font-bold text-rpg-gold">📊 Encyclopedia Statistics</h3>
      <button onclick="this.closest('.fixed').remove()" class="text-rpg-gold hover:text-white text-2xl">✕</button>
    </div>
    
    <div class="grid grid-cols-2 gap-6">
      <div>
        <h4 class="text-lg font-bold text-rpg-gold mb-3">Overview</h4>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-400">Total Items:</span>
            <span class="text-rpg-gold font-bold">${stats.total}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Legendary:</span>
            <span class="text-yellow-400 font-bold">${stats.legendary}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Drop Items:</span>
            <span class="text-red-400 font-bold">${stats.drops}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Craftable:</span>
            <span class="text-blue-400 font-bold">${stats.craftable}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Recipes:</span>
            <span class="text-green-400 font-bold">${stats.recipes}</span>
          </div>
        </div>
      </div>
      
      <div>
        <h4 class="text-lg font-bold text-rpg-gold mb-3">By Type</h4>
        <div class="space-y-1 text-sm max-h-40 overflow-y-auto">
          ${Object.entries(stats.byType)
            .sort(([,a], [,b]) => b - a) // Sort by count descending
            .map(([type, count]) => `
              <div class="flex justify-between">
                <span class="text-gray-400">${type}:</span>
                <span class="text-rpg-gold">${count}</span>
              </div>
            `).join('')}
        </div>
      </div>
    </div>
    
    ${Object.keys(stats.byClass).length > 0 ? `
      <div class="mt-6">
        <h4 class="text-lg font-bold text-rpg-gold mb-3">By Class</h4>
        <div class="grid grid-cols-2 gap-4 text-sm">
          ${Object.entries(stats.byClass)
            .sort(([,a], [,b]) => b - a) // Sort by count descending
            .map(([className, count]) => `
              <div class="flex justify-between">
                <span class="text-gray-400">${className}:</span>
                <span class="text-rpg-gold">${count}</span>
              </div>
            `).join('')}
        </div>
      </div>
    ` : ''}
  `;
  
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
};

// Dependency Analysis Functions
window.analyzeDependencies = async function() {
  try {
    const button = event.target;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = '🔗 Analyzing...';
    
    const result = await ipcRenderer.invoke('analyze-dependencies');
    
    if (result.success) {
      alert(`✅ Dependency analysis completed!\n\nFound ${result.total_items} craftable items with dependencies.\n\nDependencies saved to encyclopedia-data/dependencies.json`);
    } else {
      alert(`❌ Analysis failed: ${result.error}`);
    }
  } catch (error) {
    console.error('Error analyzing dependencies:', error);
    alert('❌ Error analyzing dependencies: ' + error.message);
  } finally {
    const button = event.target;
    button.disabled = false;
    button.textContent = '🔗 Analyze Dependencies';
  }
};





window.showDependencyStats = async function() {
  try {
    const stats = await ipcRenderer.invoke('get-dependency-stats');
    
    if (!stats) {
      alert('No dependency data found. Please run dependency analysis first.');
      return;
    }
    
    // Create and show dependency stats modal
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.onclick = () => modal.remove();
    
    const modalContent = document.createElement('div');
    modalContent.className = 'bg-rpg-dark border-2 border-rpg-gold rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto';
    modalContent.onclick = (e) => e.stopPropagation();
    
    modalContent.innerHTML = `
      <div class="flex justify-between items-start mb-4">
        <h3 class="text-2xl font-bold text-rpg-gold">🔗 Dependency Analysis Statistics</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-rpg-gold hover:text-white text-2xl">✕</button>
      </div>
      
      <div class="grid grid-cols-2 gap-6">
        <div>
          <h4 class="text-lg font-bold text-rpg-gold mb-3">Overview</h4>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-400">Total Craftable Items:</span>
              <span class="text-rpg-gold font-bold">${stats.total_craftable_items}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">Average Complexity:</span>
              <span class="text-blue-400 font-bold">${stats.average_complexity.toFixed(2)}</span>
            </div>
          </div>
        </div>
        
        <div>
          <h4 class="text-lg font-bold text-rpg-gold mb-3">By Complexity</h4>
          <div class="space-y-1 text-sm max-h-40 overflow-y-auto">
            ${Object.entries(stats.by_complexity)
              .sort(([a], [b]) => parseInt(a) - parseInt(b))
              .map(([complexity, count]) => `
                <div class="flex justify-between">
                  <span class="text-gray-400">Complexity ${complexity}:</span>
                  <span class="text-rpg-gold">${count} items</span>
                </div>
              `).join('')}
          </div>
        </div>
      </div>
      
      <div class="mt-6">
        <h4 class="text-lg font-bold text-rpg-gold mb-3">By Item Type</h4>
        <div class="grid grid-cols-3 gap-4 text-sm">
          ${Object.entries(stats.by_type)
            .sort(([,a], [,b]) => b - a)
            .map(([type, count]) => `
              <div class="flex justify-between">
                <span class="text-gray-400">${type}:</span>
                <span class="text-rpg-gold">${count}</span>
              </div>
            `).join('')}
        </div>
      </div>
      
      <div class="mt-6">
        <h4 class="text-lg font-bold text-rpg-gold mb-3">Most Complex Items</h4>
        <div class="space-y-2 text-sm">
          ${stats.most_complex_items.map(item => `
            <div class="flex justify-between p-2 bg-rpg-darker rounded">
              <span class="text-gray-400">${item.name}</span>
              <span class="text-red-400 font-bold">Complexity: ${item.complexity}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
  } catch (error) {
    console.error('Error showing dependency stats:', error);
    alert('Error loading dependency statistics: ' + error.message);
  }
};

window.loadAllEncyclopediaData = async function() {
  try {
    console.log('🔄 Loading encyclopedia data...');
    const [items, monsters, translations, titles, stats] = await Promise.all([
      ipcRenderer.invoke('get-encyclopedia-items'),
      ipcRenderer.invoke('get-encyclopedia-monsters'),
      ipcRenderer.invoke('get-encyclopedia-translations'),
      ipcRenderer.invoke('get-encyclopedia-titles'),
      ipcRenderer.invoke('get-encyclopedia-stats')
    ]);
    
    console.log('📊 Data loaded:', {
      items: items?.length || 0,
      monsters: monsters?.length || 0,
      translations: translations?.length || 0,
      titles: titles?.length || 0,
      stats: stats ? 'loaded' : 'not loaded'
    });
    
    // Check sample items for properties
    if (items && items.length > 0) {
      console.log('🔍 Sample items properties:', items.slice(0, 3).map(item => ({
        name: item.name,
        isLegendary: item.isLegendary,
        isCraftable: item.isCraftable,
        type: item.type
      })));
    }
    
    encyclopediaData = { items, monsters, translations, titles, stats };
    console.log('✅ Encyclopedia data loaded successfully');
  } catch (error) {
    console.error('❌ Error loading encyclopedia data:', error);
  }
};

function displayEncyclopediaResults(results, title) {
  const contentSection = document.getElementById('encyclopedia-content');
  if (!contentSection) return;

  let html = `<h3 class="text-2xl font-bold mb-4 text-rpg-gold">${title}</h3>`;
  
  if (results.items && results.items.length > 0) {
    html += renderItemsGrid(results.items);
  }
  if (results.monsters && results.monsters.length > 0) {
    html += renderMonstersGrid(results.monsters);
  }
  if (results.translations && results.translations.length > 0) {
    html += renderTranslationsGrid(results.translations);
  }
  if (results.titles && results.titles.length > 0) {
    html += renderTitlesGrid(results.titles);
  }
  
  if (results.total === 0 || (!results.items && !results.monsters && !results.translations && !results.titles)) {
    html = '<div class="text-center text-gray-400 mt-8">No results found</div>';
  }
  
  contentSection.innerHTML = html;
}

function renderItemsGrid(items) {
  return `
    <div class="mb-6">
      <div class="flex justify-between items-center mb-3">
        <h4 class="text-xl font-bold text-rpg-gold">Items (${items.length})</h4>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <label class="text-sm text-rpg-gold">Sort by:</label>
            <select id="item-sort-by" class="p-2 bg-rpg-darker border border-rpg-gold text-rpg-gold rounded text-sm" onchange="sortItems()">
              <option value="name">Name</option>
              <option value="level">Level</option>
              <option value="type">Type</option>
              <option value="damage">Damage</option>
              <option value="armor">Armor</option>
              <option value="strength">Strength</option>
              <option value="dexterity">Dexterity</option>
              <option value="endurance">Endurance</option>
              <option value="wisdom">Wisdom</option>
              <option value="health">Health</option>
              <option value="mana">Mana</option>
              <option value="stamina">Stamina</option>
              <option value="block">Block</option>
              <option value="crawled_at">Date Added</option>
            </select>
            <select id="item-sort-order" class="p-2 bg-rpg-darker border border-rpg-gold text-rpg-gold rounded text-sm" onchange="sortItems()">
              <option value="asc">↑ Asc</option>
              <option value="desc">↓ Desc</option>
            </select>
          </div>
        </div>
      </div>
      <div id="items-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${items.map(item => `
          <div class="encyclopedia-card p-4 rounded-lg border border-rpg-gold hover:border-rpg-gold/80 transition-all cursor-pointer" onclick="showItemDetails('${item.id}')">
            <div class="flex items-center justify-between mb-2">
              <h5 class="font-bold text-rpg-gold text-lg">${item.name}</h5>
              ${item.isLegendary ? '<span class="text-yellow-400 text-sm">⭐ Legendary</span>' : ''}
            </div>
            
            <div class="flex justify-center mb-3">
              <img src="${item.image_url}" alt="${item.name}" class="max-w-20 max-h-20 object-contain">
              </div>
            
            <div class="text-sm space-y-2">
              <div class="flex justify-between">
                <span class="text-gray-400">Type:</span>
                <span class="text-rpg-gold">${item.type}</span>
              </div>
                      ${Object.keys(item.attributes).length > 0 ? `
          <div>
            <h4 class="text-lg font-bold text-rpg-gold mb-2">Attributes</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              ${Object.entries(item.attributes).map(([key, value]) => `
                <div class="flex justify-between">
                  <span class="text-gray-400">${key}:</span>
                  <span class="text-rpg-gold">${typeof value === 'number' && key !== 'DamageMin' && key !== 'DamageMax' ? '+' : ''}${ key.includes('Prot')  || key.includes('Block')?  value*100+'%': value}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        ${Object.keys(item.requirements).length > 0 ? `

        <hr/>
          <div>
            <h4 class="text-lg font-bold text-rpg-gold mb-2">Requirements</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              ${Object.entries(item.requirements).map(([key, value]) => `
                <div class="flex justify-between">
                  <span class="text-gray-400">${key}:</span>
                  <span class="text-rpg-gold">${value}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
            </div>
            <div class="mt-3 pt-2 border-t border-rpg-gold/30">
              <div class="flex flex-wrap gap-2 text-xs">
                ${item.isDrop ? '<span class="bg-red-500 text-white px-2 py-1 rounded">Drop</span>' : ''}
                ${item.isCraftable ? '<span class="bg-blue-500 text-white px-2 py-1 rounded">Craftable</span>' : ''}
                ${item.type === 'Recipe' ? '<span class="bg-green-500 text-white px-2 py-1 rounded">Recipe</span>' : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderMonstersGrid(monsters) {
  return `
    <div class="mb-6">
      <div class="flex justify-between items-center mb-3">
        <h4 class="text-xl font-bold text-rpg-gold">Monsters (${monsters.length})</h4>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <label class="text-sm text-rpg-gold">Sort by:</label>
            <select id="monster-sort-by" class="p-2 bg-rpg-darker border border-rpg-gold text-rpg-gold rounded text-sm" onchange="sortMonsters()">
              <option value="name">Name</option>
              <option value="level">Level</option>
              <option value="hp">HP</option>
              <option value="attack">Attack</option>
              <option value="defense">Defense</option>
              <option value="location">Location</option>
              <option value="crawled_at">Date Added</option>
            </select>
            <select id="monster-sort-order" class="p-2 bg-rpg-darker border border-rpg-gold text-rpg-gold rounded text-sm" onchange="sortMonsters()">
              <option value="asc">↑ Asc</option>
              <option value="desc">↓ Desc</option>
            </select>
          </div>
        </div>
      </div>
      <div id="monsters-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${monsters.map(monster => `
          <div class="encyclopedia-card p-4 rounded-lg">
            <div class="flex items-center space-x-3 mb-2">
              <span class="text-2xl">👹</span>
              <h5 class="font-bold text-rpg-gold">${monster.name}</h5>
            </div>
            <div class="text-sm space-y-1">
              <p><span class="text-gray-400">Level:</span> ${monster.level}</p>
              <p><span class="text-gray-400">HP:</span> ${monster.hp}</p>
              <p><span class="text-gray-400">Attack:</span> ${monster.attack}</p>
              <p><span class="text-gray-400">Defense:</span> ${monster.defense}</p>
              <p><span class="text-gray-400">Location:</span> ${monster.location}</p>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderTranslationsGrid(translations) {
  return `
    <div class="mb-6">
      <div class="flex justify-between items-center mb-3">
        <h4 class="text-xl font-bold text-rpg-gold">Translations (${translations.length})</h4>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <label class="text-sm text-rpg-gold">Sort by:</label>
            <select id="translation-sort-by" class="p-2 bg-rpg-darker border border-rpg-gold text-rpg-gold rounded text-sm" onchange="sortTranslations()">
              <option value="name">Name</option>
              <option value="level">Level</option>
              <option value="type">Type</option>
              <option value="damage">Damage</option>
              <option value="mana">Mana Cost</option>
              <option value="cooldown">Cooldown</option>
              <option value="crawled_at">Date Added</option>
            </select>
            <select id="translation-sort-order" class="p-2 bg-rpg-darker border border-rpg-gold text-rpg-gold rounded text-sm" onchange="sortTranslations()">
              <option value="asc">↑ Asc</option>
              <option value="desc">↓ Desc</option>
            </select>
          </div>
        </div>
      </div>
      <div id="translations-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${translations.map(translation => `
          <div class="encyclopedia-card p-4 rounded-lg">
            <div class="flex items-center space-x-3 mb-2">
              <span class="text-2xl">⚡</span>
              <h5 class="font-bold text-rpg-gold">${translation.name}</h5>
            </div>
            <div class="text-sm space-y-1">
              <p><span class="text-gray-400">Type:</span> ${translation.type}</p>
              <p><span class="text-gray-400">Level:</span> ${translation.level}</p>
              <p><span class="text-gray-400">Cooldown:</span> ${translation.cooldown}s</p>
              ${translation.description ? `<p class="text-gray-300">${translation.description}</p>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderTitlesGrid(titles) {
  return `
    <div class="mb-6">
      <div class="flex justify-between items-center mb-3">
        <h4 class="text-xl font-bold text-rpg-gold">Titles (${titles.length})</h4>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <label class="text-sm text-rpg-gold">Sort by:</label>
            <select id="title-sort-by" class="p-2 bg-rpg-darker border border-rpg-gold text-rpg-gold rounded text-sm" onchange="sortTitles()">
              <option value="name">Name</option>
              <option value="level">Level</option>
              <option value="strength">Strength</option>
              <option value="dexterity">Dexterity</option>
              <option value="endurance">Endurance</option>
              <option value="wisdom">Wisdom</option>
              <option value="health">Health</option>
              <option value="mana">Mana</option>
              <option value="stamina">Stamina</option>
              <option value="crawled_at">Date Added</option>
            </select>
            <select id="title-sort-order" class="p-2 bg-rpg-darker border border-rpg-gold text-rpg-gold rounded text-sm" onchange="sortTitles()">
              <option value="asc">↑ Asc</option>
              <option value="desc">↓ Desc</option>
            </select>
          </div>
        </div>
      </div>
      <div id="titles-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${titles.map(title => `
          <div class="encyclopedia-card p-4 rounded-lg">
            <div class="flex items-center space-x-3 mb-2">
              <span class="text-2xl">📋</span>
              <h5 class="font-bold text-rpg-gold">${title.name}</h5>
            </div>
            <div class="text-sm space-y-1">

                                  ${Object.keys(title.attributes).length > 0 ? `
          <div>
            <h4 class="text-lg font-bold text-rpg-gold mb-2">Attributes</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              ${Object.entries(title.attributes).map(([key, value]) => `
                <div class="flex justify-between">
                  <span class="text-gray-400">${key}:</span>
                  <span class="text-rpg-gold">${typeof value === 'number' && key !== 'DamageMin' && key !== 'DamageMax' ? '+' : ''}${ key.includes('Prot')  || key.includes('Block')?  value*100+'%': value}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        <hr/>
        ${Object.keys(title.requirements).length > 0 ? `
          <div>
            <h4 class="text-lg font-bold text-rpg-gold mb-2">Requirements</h4>
            <div class="grid grid-cols-2 gap-2 text-sm">
              ${Object.entries(title.requirements).map(([key, value]) => `
                <div class="flex justify-between">
                  <span class="text-gray-400">${key}:</span>
                  <span class="text-rpg-gold">${value}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

                    <div class="mt-3 pt-2 border-t border-rpg-gold/30">
              <div class="flex flex-wrap gap-2 text-xs">
                ${title.slots.Weapon ? '<span class="bg-grey-500 text-white px-2 py-1 rounded">Weapon</span>' : ''}
                ${title.slots.Shield ? '<span class="bg-grey-500 text-white px-2 py-1 rounded">Shield</span>' : ''}
                ${title.slots.Helm ? '<span class="bg-grey-500 text-white px-2 py-1 rounded">Helm</span>' : ''}
                ${title.slots.BodyArmor ? '<span class="bg-grey-500 text-white px-2 py-1 rounded">Body Armor</span>' : ''}
                ${title.slots.Boots ? '<span class="bg-grey-500 text-white px-2 py-1 rounded">Boots</span>' : ''}
                ${title.slots.Amulet ? '<span class="bg-grey-500 text-white px-2 py-1 rounded">Amulet</span>' : ''}
                ${title.slots.Ring ? '<span class="bg-grey-500 text-white px-2 py-1 rounded">Ring</span>' : ''}
              </div>
            </div>

            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Title sorting functionality
window.sortTitles = function() {
  const sortBy = document.getElementById('title-sort-by').value;
  const sortOrder = document.getElementById('title-sort-order').value;
  
  if (!encyclopediaData || !encyclopediaData.titles) return;
  
  const titles = [...encyclopediaData.titles];
  
  titles.sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'level':
        const levelA = a.requirements?.Level || 0;
        const levelB = b.requirements?.Level || 0;
        comparison = levelA - levelB;
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
      case 'crawled_at':
        comparison = new Date(a.crawled_at) - new Date(b.crawled_at);
        break;
      default:
        comparison = 0;
    }
    
    // Apply sort order
    if (sortOrder === 'desc') {
      comparison = -comparison;
    }
    
    return comparison;
  });
  
  // Update the titles display
  const titlesContainer = document.getElementById('titles-container');
  if (titlesContainer) {
    titlesContainer.innerHTML = titles.map(title => `
      <div class="encyclopedia-card p-4 rounded-lg">
        <div class="flex items-center space-x-3 mb-2">
          <span class="text-2xl">📋</span>
          <h5 class="font-bold text-rpg-gold">${title.name}</h5>
        </div>
        <div class="text-sm space-y-1">

          ${Object.keys(title.attributes).length > 0 ? `
            <div>
              <h4 class="text-lg font-bold text-rpg-gold mb-2">Attributes</h4>
              <div class="grid grid-cols-2 gap-2 text-sm">
                ${Object.entries(title.attributes).map(([key, value]) => `
                  <div class="flex justify-between">
                    <span class="text-gray-400">${key}:</span>
                    <span class="text-rpg-gold">${typeof value === 'number' && key !== 'DamageMin' && key !== 'DamageMax' ? '+' : ''}${ key.includes('Prot')  || key.includes('Block')?  value*100+'%': value}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          <hr/>
          ${Object.keys(title.requirements).length > 0 ? `
            <div>
              <h4 class="text-lg font-bold text-rpg-gold mb-2">Requirements</h4>
              <div class="grid grid-cols-2 gap-2 text-sm">
                ${Object.entries(title.requirements).map(([key, value]) => `
                  <div class="flex justify-between">
                    <span class="text-gray-400">${key}:</span>
                    <span class="text-rpg-gold">${value}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div class="mt-3 pt-2 border-t border-rpg-gold/30">
            <div class="flex flex-wrap gap-2 text-xs">
              ${title.slots.Weapon ? '<span class="bg-grey-500 text-white px-2 py-1 rounded">Weapon</span>' : ''}
              ${title.slots.Shield ? '<span class="bg-grey-500 text-white px-2 py-1 rounded">Shield</span>' : ''}
              ${title.slots.Helm ? '<span class="bg-grey-500 text-white px-2 py-1 rounded">Helm</span>' : ''}
              ${title.slots.BodyArmor ? '<span class="bg-grey-500 text-white px-2 py-1 rounded">Body Armor</span>' : ''}
              ${title.slots.Boots ? '<span class="bg-grey-500 text-white px-2 py-1 rounded">Boots</span>' : ''}
              ${title.slots.Amulet ? '<span class="bg-grey-500 text-white px-2 py-1 rounded">Amulet</span>' : ''}
              ${title.slots.Ring ? '<span class="bg-grey-500 text-white px-2 py-1 rounded">Ring</span>' : ''}
            </div>
          </div>

        </div>
      </div>
    `).join('');
  }
  
  console.log(`✅ Titles sorted by ${sortBy} in ${sortOrder} order`);
};

// Items sorting functionality
window.sortItems = function() {
  const sortBy = document.getElementById('item-sort-by').value;
  const sortOrder = document.getElementById('item-sort-order').value;
  
  if (!encyclopediaData || !encyclopediaData.items) return;
  
  const items = [...encyclopediaData.items];
  
  items.sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'level':
        const levelA = a.requirements?.Level || 0;
        const levelB = b.requirements?.Level || 0;
        comparison = levelA - levelB;
        break;
      case 'type':
        comparison = a.type.localeCompare(b.type);
        break;
      case 'damage':
        const damageA = (a.attributes?.DamageMin || 0) + (a.attributes?.DamageMax || 0);
        const damageB = (b.attributes?.DamageMin || 0) + (b.attributes?.DamageMax || 0);
        comparison = damageA - damageB;
        break;
      case 'armor':
        const armorA = a.attributes?.Armor || 0;
        const armorB = b.attributes?.Armor || 0;
        comparison = armorA - armorB;
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
      case 'crawled_at':
        comparison = new Date(a.crawled_at) - new Date(b.crawled_at);
        break;
      default:
        comparison = 0;
    }
    
    // Apply sort order
    if (sortOrder === 'desc') {
      comparison = -comparison;
    }
    
    return comparison;
  });
  
  // Update the items display
  const itemsContainer = document.getElementById('items-container');
  if (itemsContainer) {
    itemsContainer.innerHTML = items.map(item => `
      <div class="encyclopedia-card p-4 rounded-lg border border-rpg-gold hover:border-rpg-gold/80 transition-all cursor-pointer" onclick="showItemDetails('${item.id}')">
        <div class="flex items-center justify-between mb-2">
          <h5 class="font-bold text-rpg-gold text-lg">${item.name}</h5>
          ${item.isLegendary ? '<span class="text-yellow-400 text-sm">⭐ Legendary</span>' : ''}
        </div>
        
        <div class="flex justify-center mb-3">
          <img src="${item.image_url}" alt="${item.name}" class="max-w-20 max-h-20 object-contain">
        </div>
        
        <div class="text-sm space-y-2">
          <div class="flex justify-between">
            <span class="text-gray-400">Type:</span>
            <span class="text-rpg-gold">${item.type}</span>
          </div>
          ${Object.keys(item.attributes).length > 0 ? `
            <div>
              <h4 class="text-lg font-bold text-rpg-gold mb-2">Attributes</h4>
              <div class="grid grid-cols-2 gap-2 text-sm">
                ${Object.entries(item.attributes).map(([key, value]) => `
                  <div class="flex justify-between">
                    <span class="text-gray-400">${key}:</span>
                    <span class="text-rpg-gold">${typeof value === 'number' && key !== 'DamageMin' && key !== 'DamageMax' ? '+' : ''}${ key.includes('Prot')  || key.includes('Block')?  value*100+'%': value}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          ${Object.keys(item.requirements).length > 0 ? `
            <hr/>
            <div>
              <h4 class="text-lg font-bold text-rpg-gold mb-2">Requirements</h4>
              <div class="grid grid-cols-2 gap-2 text-sm">
                ${Object.entries(item.requirements).map(([key, value]) => `
                  <div class="flex justify-between">
                    <span class="text-gray-400">${key}:</span>
                    <span class="text-rpg-gold">${value}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
        <div class="mt-3 pt-2 border-t border-rpg-gold/30">
          <div class="flex flex-wrap gap-2 text-xs">
            ${item.isDrop ? '<span class="bg-red-500 text-white px-2 py-1 rounded">Drop</span>' : ''}
            ${item.isCraftable ? '<span class="bg-blue-500 text-white px-2 py-1 rounded">Craftable</span>' : ''}
            ${item.type === 'Recipe' ? '<span class="bg-green-500 text-white px-2 py-1 rounded">Recipe</span>' : ''}
          </div>
        </div>
      </div>
    `).join('');
  }
  
  console.log(`✅ Items sorted by ${sortBy} in ${sortOrder} order`);
};

// Monsters sorting functionality
window.sortMonsters = function() {
  const sortBy = document.getElementById('monster-sort-by').value;
  const sortOrder = document.getElementById('monster-sort-order').value;
  
  if (!encyclopediaData || !encyclopediaData.monsters) return;
  
  const monsters = [...encyclopediaData.monsters];
  
  monsters.sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'level':
        comparison = (a.level || 0) - (b.level || 0);
        break;
      case 'hp':
        comparison = (a.hp || 0) - (b.hp || 0);
        break;
      case 'attack':
        comparison = (a.attack || 0) - (b.attack || 0);
        break;
      case 'defense':
        comparison = (a.defense || 0) - (b.defense || 0);
        break;
      case 'location':
        comparison = (a.location || '').localeCompare(b.location || '');
        break;
      case 'crawled_at':
        comparison = new Date(a.crawled_at) - new Date(b.crawled_at);
        break;
      default:
        comparison = 0;
    }
    
    // Apply sort order
    if (sortOrder === 'desc') {
      comparison = -comparison;
    }
    
    return comparison;
  });
  
  // Update the monsters display
  const monstersContainer = document.getElementById('monsters-container');
  if (monstersContainer) {
    monstersContainer.innerHTML = monsters.map(monster => `
      <div class="encyclopedia-card p-4 rounded-lg">
        <div class="flex items-center space-x-3 mb-2">
          <span class="text-2xl">👹</span>
          <h5 class="font-bold text-rpg-gold">${monster.name}</h5>
        </div>
        <div class="text-sm space-y-1">
          <p><span class="text-gray-400">Level:</span> ${monster.level}</p>
          <p><span class="text-gray-400">HP:</span> ${monster.hp}</p>
          <p><span class="text-gray-400">Attack:</span> ${monster.attack}</p>
          <p><span class="text-gray-400">Defense:</span> ${monster.defense}</p>
          <p><span class="text-gray-400">Location:</span> ${monster.location}</p>
        </div>
      </div>
    `).join('');
  }
  
  console.log(`✅ Monsters sorted by ${sortBy} in ${sortOrder} order`);
};

// Translations sorting functionality
window.sortTranslations = function() {
  const sortBy = document.getElementById('translation-sort-by').value;
  const sortOrder = document.getElementById('translation-sort-order').value;
  
  if (!encyclopediaData || !encyclopediaData.translations) return;
  
  const translations = [...encyclopediaData.translations];
  
  translations.sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'level':
        comparison = (a.level || 0) - (b.level || 0);
        break;
      case 'type':
        comparison = (a.type || '').localeCompare(b.type || '');
        break;
      case 'damage':
        comparison = (a.damage || 0) - (b.damage || 0);
        break;
      case 'mana':
        comparison = (a.mana || 0) - (b.mana || 0);
        break;
      case 'cooldown':
        comparison = (a.cooldown || 0) - (b.cooldown || 0);
        break;
      case 'crawled_at':
        comparison = new Date(a.crawled_at) - new Date(b.crawled_at);
        break;
      default:
        comparison = 0;
    }
    
    // Apply sort order
    if (sortOrder === 'desc') {
      comparison = -comparison;
    }
    
    return comparison;
  });
  
  // Update the translations display
  const translationsContainer = document.getElementById('translations-container');
  if (translationsContainer) {
    translationsContainer.innerHTML = translations.map(translation => `
      <div class="encyclopedia-card p-4 rounded-lg">
        <div class="flex items-center space-x-3 mb-2">
          <span class="text-2xl">⚡</span>
          <h5 class="font-bold text-rpg-gold">${skill.name}</h5>
        </div>
        <div class="text-sm space-y-1">
          <p><span class="text-gray-400">Level:</span> ${skill.level}</p>
          <p><span class="text-gray-400">Type:</span> ${skill.type}</p>
          <p><span class="text-gray-400">Damage:</span> ${skill.damage}</p>
          <p><span class="text-gray-400">Mana Cost:</span> ${skill.mana}</p>
          <p><span class="text-gray-400">Cooldown:</span> ${skill.cooldown}</p>
        </div>
      </div>
    `).join('');
  }
  
  console.log(`✅ Translations sorted by ${sortBy} in ${sortOrder} order`);
};

// Add helper to get config from form
function getConfigFromForm() {
  return {
    all: document.getElementById('config-all').checked,
    recipe: document.getElementById('config-recipe').checked,
    charm: document.getElementById('config-charm').checked,
    pieceGear: document.getElementById('config-pieceGear').checked,
    jewel: document.getElementById('config-jewel').checked,
    rune: document.getElementById('config-rune').checked,
    epicGear: document.getElementById('config-epicGear').checked,
    magicScroll: document.getElementById('config-magicScroll').checked,
    monsterScroll: document.getElementById('config-monsterScroll').checked,
    staminaPotion: document.getElementById('config-staminaPotion').checked,
    ancientPotion: document.getElementById('config-ancientPotion').checked,
    monsterList: document.getElementById('config-monsterList').value.trim(),
    hpThreshold: document.getElementById('config-hpThreshold').value
  };
}

// Add helper to set form from config
function setConfigToForm(config) {
  document.getElementById('config-all').checked = !!config.all;
  document.getElementById('config-recipe').checked = !!config.recipe;
  document.getElementById('config-charm').checked = !!config.charm;
  document.getElementById('config-pieceGear').checked = !!config.pieceGear;
  document.getElementById('config-jewel').checked = !!config.jewel;
  document.getElementById('config-rune').checked = !!config.rune;
  document.getElementById('config-epicGear').checked = !!config.epicGear;
  document.getElementById('config-magicScroll').checked = !!config.magicScroll;
  document.getElementById('config-monsterScroll').checked = !!config.monsterScroll;
  document.getElementById('config-staminaPotion').checked = !!config.staminaPotion;
  document.getElementById('config-ancientPotion').checked = !!config.ancientPotion;
  document.getElementById('config-monsterList').value = config.monsterList || '';
  document.getElementById('config-hpThreshold').value = config.hpThreshold || '';
}

window.editAccount = function(id) {
  const acc = accounts.find(a => a.id === id);
  if (!acc) return;
  editingId = id;
  document.getElementById('form-title').innerHTML = '✏️ Edit Warrior';
  document.getElementById('username').value = acc.username;
  document.getElementById('password').value = acc.password;
  document.getElementById('account-id').value = acc.id;
  setConfigToForm(acc.config || {});
  document.getElementById('save-btn').innerHTML = '⚔️ Update Warrior';
  document.getElementById('cancel-btn').style.display = '';
};

window.deleteAccount = async function(id) {
  accounts = accounts.filter(a => a.id !== id);
  await ipcRenderer.invoke('save-accounts', accounts);
  loadAccounts();
};

// New function: Start Browser (with login)
window.startBrowser = async function(id) {
  const acc = accounts.find(a => a.id === id);
  if (!acc) return;
  outputs[acc.id] = '';
  browserState[acc.id] = 'started';
  running[acc.id] = true;
  automationState[acc.id] = 'running';
  renderAccounts();
  renderTabs();
  appendOutput(id, '🌐 Starting browser with login for warrior...\n');
  await ipcRenderer.invoke('start-automation', acc);
};

// Legacy function: Run Account (now calls startBrowser)
window.runAccount = async function(id) {
  await startBrowser(id);
};

window.toggleAutomation = async function(id) {
  const state = automationState[id];
  if (state === 'running') {
    await ipcRenderer.send('pause-automation', { accountId: id });
    automationState[id] = 'paused';
    appendOutput(id, '⏸️ Automation paused - Warrior is resting.\n');
  } else if (state === 'paused') {
    await ipcRenderer.send('resume-automation', { accountId: id });
    automationState[id] = 'running';
    appendOutput(id, '▶️ Automation resumed - Warrior is auto-fighting!\n');
  } else {
    // Start automation without login (skip login step)
    const acc = accounts.find(a => a.id === id);
    if (!acc) return;
    appendOutput(id, '🤖 Starting automation script (skipping login)...\n');
    await ipcRenderer.invoke('start-automation-skip-login', acc);
  }
  renderAccounts();
  renderTabs();
};

window.toggleUnscroll = async function(id) {
  const state = unscrollState[id];
  if (state === 'running') {
    await ipcRenderer.send('pause-unscroll', { accountId: id });
    unscrollState[id] = 'paused';
    appendOutput(id, '⏸️ Unscroll paused - Warrior is resting.\n');
  } else if (state === 'paused') {
    await ipcRenderer.send('resume-unscroll', { accountId: id });
    unscrollState[id] = 'running';
    appendOutput(id, '▶️ Unscroll resumed - Warrior is unscrolling!\n');
  } else {
    // Start unscroll without login (skip login step)
    const acc = accounts.find(a => a.id === id);
    if (!acc) return;
    appendOutput(id, '📜 Starting unscroll script (skipping login)...\n');
    await ipcRenderer.invoke('start-unscroll-skip-login', acc);
    unscrollState[id] = 'running';
    appendOutput(id, '📜 Unscroll started - Warrior is unscrolling!\n');
  }
  renderAccounts();
  renderTabs();
};

window.stopAccount = async function(id) {
  if (automationState[id] === 'running' || automationState[id] === 'paused') {
    await ipcRenderer.invoke('stop-automation', id);
    automationState[id] = undefined;
  }
  if (unscrollState[id] === 'running' || unscrollState[id] === 'paused') {
    await ipcRenderer.invoke('stop-unscroll', id);
    unscrollState[id] = undefined;
  }
  
  // Stop the specific browser for this account
  await ipcRenderer.invoke('stop-browser', id);
  
  // Reset all states
  running[id] = false;
  browserState[id] = undefined;
  renderAccounts();
  renderTabs();
  appendOutput(id, '⏹️ Warrior returned to barracks and browser closed.\n');
};

document.getElementById('account-form').onsubmit = async function(e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  let id = document.getElementById('account-id').value;
  const config = getConfigFromForm();
  if (!username || !password) return;

  if (editingId) {
    // Update existing account
    const idx = accounts.findIndex(a => a.id === editingId);
    if (idx !== -1) {
      accounts[idx].username = username;
      accounts[idx].password = password;
      accounts[idx].config = config;
    }
    editingId = null;
  } else {
    // Add new account
    id = Math.random().toString(36).substr(2, 9);
    accounts.push({ id, username, password, config });
  }
  
  await ipcRenderer.invoke('save-accounts', accounts);
  
  // Reset form
  document.getElementById('account-form').reset();
  document.getElementById('form-title').innerHTML = '➕ Add New Warrior';
  document.getElementById('save-btn').innerHTML = '➕ Add Warrior';
  document.getElementById('cancel-btn').style.display = 'none';
  
  // Only re-render accounts, don't reload everything
  renderAccounts();
};

document.getElementById('cancel-btn').onclick = function() {
  editingId = null;
  document.getElementById('account-form').reset();
  document.getElementById('form-title').innerHTML = '➕ Add New Warrior';
  document.getElementById('save-btn').innerHTML = '➕ Add Warrior';
  document.getElementById('cancel-btn').style.display = 'none';
};

// Listen for automation output
ipcRenderer.on('automation-output', (event, { id, output }) => {
  appendOutput(id, output);
});

ipcRenderer.on('automation-log', (event, { accountId, log }) => {
  appendOutput(accountId, `[Puppeteer] ${log}\n`);
});

ipcRenderer.on('automation-exit', (event, { accountId }) => {
  automationState[accountId] = undefined;
  running[accountId] = false;
  renderAccounts();
  renderTabs();
  appendOutput(accountId, '[Puppeteer] Automation process ended.\n');
});

// Listen for unscroll output
ipcRenderer.on('unscroll-output', (event, { id, output }) => {
  appendOutput(id, output);
});

ipcRenderer.on('unscroll-log', (event, { accountId, log }) => {
  appendOutput(accountId, `[Unscroll] ${log}\n`);
});

ipcRenderer.on('unscroll-exit', (event, { accountId }) => {
  unscrollState[accountId] = undefined;
  renderAccounts();
  renderTabs();
  appendOutput(accountId, '[Unscroll] Unscroll process ended.\n');
});

// Listen for encyclopedia output
ipcRenderer.on('encyclopedia-log', (event, { accountId, log, stats, sessionId }) => {
  appendOutput(accountId, `[Encyclopedia] ${log}\n`);
  
  // Update crawl progress if this is from encyclopedia
  if (log.includes('completed') || log.includes('successfully')) {
    isCrawling = false;
    updateCrawlUI();
    // Refresh encyclopedia data
    loadAllEncyclopediaData();
  }
});

ipcRenderer.on('encyclopedia-exit', (event, { accountId }) => {
  isCrawling = false;
  updateCrawlUI();
  appendOutput(accountId, '[Encyclopedia] Encyclopedia crawling process ended.\n');
});

// Listen for webview execution commands
ipcRenderer.on('execute-in-webview', (event, { accountId, script, requestId }) => {
  const webview = webviews[accountId];
  if (webview) {
    try {
      if (requestId) {
        // For getTextContent, return the result
        webview.executeJavaScript(script).then(result => {
          ipcRenderer.send('webview-text-content', { accountId, text: result, requestId });
        });
      } else {
        webview.executeJavaScript(script);
      }
    } catch (error) {
      console.log('Error executing script in webview:', error);
    }
  }
});

loadAccounts(); 
