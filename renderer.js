const { ipcRenderer } = require('electron');

let accounts = [];
let running = {};
let editingId = null;
let outputs = {};
let webviews = {};
let activeTab = null;
let automationState = {}; // { [id]: 'running' | 'paused' | undefined }
let unscrollState = {}; // { [id]: 'running' | 'paused' | undefined }
let encyclopediaData = {
  items: [],
  monsters: [],
  skills: [],
  quests: [],
  stats: null
};
let isCrawling = false;
let crawlProgress = 0;

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
    const toggleLabel = isActive ? 'Pause' : (isPaused ? 'Resume' : 'Pause');
    const toggleIcon = isActive ? '⏸️' : (isPaused ? '▶️' : '⏸️');
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
            ${isActive ? '<p class="text-sm text-green-400">🤖 Auto: ON</p>' : isPaused ? '<p class="text-sm text-yellow-400">⏸️ Paused</p>' : ''}
            ${isUnscrollRunning ? '<p class="text-sm text-blue-400">📜 Unscroll: ON</p>' : isUnscrollPaused ? '<p class="text-sm text-yellow-400">⏸️ Unscroll Paused</p>' : ''}
          </div>
        </div>
        <div class="flex space-x-2">
          <button onclick="editAccount('${acc.id}')" 
                  class="rpg-button px-3 py-1 rounded text-sm">✏️ Edit</button>
          <button onclick="deleteAccount('${acc.id}')" 
                  class="rpg-button px-3 py-1 rounded text-sm bg-red-900/50 border-red-500 text-red-300 hover:bg-red-700">🗑️ Delete</button>
          <button onclick="runAccount('${acc.id}')" ${isRunning ? 'disabled' : ''} 
                  class="rpg-button px-3 py-1 rounded text-sm ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}">⚡ Run</button>
          <button onclick="toggleAutomation('${acc.id}')" ${(isRunning && !isPaused) || isPaused ? '' : 'disabled'} 
                  class="rpg-button px-3 py-1 rounded text-sm ${(isActive || isPaused) ? 'bg-green-900/50 border-green-500 text-green-300' : ''}">${toggleIcon} ${toggleLabel}</button>
          <button onclick="toggleUnscroll('${acc.id}')" 
                  class="rpg-button px-3 py-1 rounded text-sm ${(isUnscrollRunning || isUnscrollPaused) ? 'bg-blue-900/50 border-blue-500 text-blue-300' : ''}">${unscrollToggleIcon} ${unscrollToggleLabel}</button>
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

  // Terminal/Output tab
  const outputTab = document.createElement('div');
  outputTab.className = `tab px-4 py-2 rounded-t-lg ${activeTab === 'output' ? 'active' : ''}`;
  outputTab.innerHTML = '📜 Terminal/Output';
  outputTab.onclick = () => switchTab('output');
  tabBar.appendChild(outputTab);

  // Render tab content
  renderOutputTab();
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

function switchTab(tabId) {
  activeTab = tabId;
  renderTabs();
}

function appendOutput(id, text) {
  outputs[id] = (outputs[id] || '') + text;
  renderTabs();
}

async function loadAccounts() {
  accounts = await ipcRenderer.invoke('get-accounts');
  if (!Array.isArray(accounts)) accounts = [];
  outputs = {};
  automationState = {};
  unscrollState = {};
  renderAccounts();
  for (const acc of accounts) {
    running[acc.id] = await ipcRenderer.invoke('is-running', acc.id);
    automationState[acc.id] = running[acc.id] ? 'running' : undefined;
    // Check if unscroll is running
    const isUnscrollRunning = await ipcRenderer.invoke('is-unscroll-running', acc.id);
    unscrollState[acc.id] = isUnscrollRunning ? 'running' : undefined;
  }
  renderAccounts();
  renderTabs();
  
  // Load initial encyclopedia data
  await loadAllEncyclopediaData();
  
  // Populate crawl account dropdown
  populateCrawlAccountDropdown();
}

// Encyclopedia Modal Functions
window.openEncyclopedia = function() {
  document.getElementById('encyclopedia-modal').classList.remove('hidden');
  loadAllEncyclopediaData();
};

window.closeEncyclopedia = function() {
  document.getElementById('encyclopedia-modal').classList.add('hidden');
};

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
    skills: document.getElementById('crawl-skills').checked,
    quests: document.getElementById('crawl-quests').checked
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
window.searchEncyclopedia = async function() {
  const query = document.getElementById('encyclopedia-search').value.trim();
  if (!query) return;

  try {
    const results = await ipcRenderer.invoke('search-encyclopedia', query);
    displayEncyclopediaResults(results, `Search results for: "${query}"`);
  } catch (error) {
    console.error('Search error:', error);
  }
};

window.filterEncyclopedia = async function(type) {
  try {
    let data = [];
    let title = '';
    
    switch (type) {
      case 'items':
        data = await ipcRenderer.invoke('get-encyclopedia-items');
        title = 'Items';
        break;
      case 'monsters':
        data = await ipcRenderer.invoke('get-encyclopedia-monsters');
        title = 'Monsters';
        break;
      case 'skills':
        data = await ipcRenderer.invoke('get-encyclopedia-skills');
        title = 'Skills';
        break;
      case 'quests':
        data = await ipcRenderer.invoke('get-encyclopedia-quests');
        title = 'Quests';
        break;
      case 'recipes':
        data = await ipcRenderer.invoke('get-encyclopedia-items', { type: 'recipe' });
        title = 'Recipes';
        break;
    }
    
    displayEncyclopediaResults({ [type]: data }, title);
  } catch (error) {
    console.error('Filter error:', error);
  }
};

window.applyAdvancedFilters = async function() {
  try {
    const itemType = document.getElementById('filter-item-type').value;
    const rarity = document.getElementById('filter-rarity').value;
    const levelMin = document.getElementById('filter-level-min').value;
    const levelMax = document.getElementById('filter-level-max').value;
    
    const filters = {};
    if (itemType) filters.type = itemType;
    if (rarity) filters.rarity = rarity;
    if (levelMin) filters.levelMin = parseInt(levelMin);
    if (levelMax) filters.levelMax = parseInt(levelMax);
    
    const data = await ipcRenderer.invoke('get-encyclopedia-items', filters);
    displayEncyclopediaResults({ items: data }, `Filtered Items (${data.length})`);
  } catch (error) {
    console.error('Advanced filter error:', error);
  }
};

window.loadAllEncyclopediaData = async function() {
  try {
    const [items, monsters, skills, quests, stats] = await Promise.all([
      ipcRenderer.invoke('get-encyclopedia-items'),
      ipcRenderer.invoke('get-encyclopedia-monsters'),
      ipcRenderer.invoke('get-encyclopedia-skills'),
      ipcRenderer.invoke('get-encyclopedia-quests'),
      ipcRenderer.invoke('get-encyclopedia-stats')
    ]);
    
    encyclopediaData = { items, monsters, skills, quests, stats };
  } catch (error) {
    console.error('Error loading encyclopedia data:', error);
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
  if (results.skills && results.skills.length > 0) {
    html += renderSkillsGrid(results.skills);
  }
  if (results.quests && results.quests.length > 0) {
    html += renderQuestsGrid(results.quests);
  }
  
  if (results.total === 0 || (!results.items && !results.monsters && !results.skills && !results.quests)) {
    html = '<div class="text-center text-gray-400 mt-8">No results found</div>';
  }
  
  contentSection.innerHTML = html;
}

function renderItemsGrid(items) {
  return `
    <div class="mb-6">
      <h4 class="text-xl font-bold mb-3 text-rpg-gold">Items (${items.length})</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${items.map(item => `
          <div class="encyclopedia-card p-4 rounded-lg">
            <div class="flex items-center space-x-3 mb-2">
              <span class="text-2xl">📦</span>
              <h5 class="font-bold text-rpg-gold">${item.name}</h5>
            </div>
            <div class="text-sm space-y-1">
              <p><span class="text-gray-400">Type:</span> ${item.type}</p>
              <p><span class="text-gray-400">Rarity:</span> ${item.rarity}</p>
              <p><span class="text-gray-400">Level:</span> ${item.level}</p>
              ${item.description ? `<p class="text-gray-300">${item.description}</p>` : ''}
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
      <h4 class="text-xl font-bold mb-3 text-rpg-gold">Monsters (${monsters.length})</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

function renderSkillsGrid(skills) {
  return `
    <div class="mb-6">
      <h4 class="text-xl font-bold mb-3 text-rpg-gold">Skills (${skills.length})</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${skills.map(skill => `
          <div class="encyclopedia-card p-4 rounded-lg">
            <div class="flex items-center space-x-3 mb-2">
              <span class="text-2xl">⚡</span>
              <h5 class="font-bold text-rpg-gold">${skill.name}</h5>
            </div>
            <div class="text-sm space-y-1">
              <p><span class="text-gray-400">Type:</span> ${skill.type}</p>
              <p><span class="text-gray-400">Level:</span> ${skill.level}</p>
              <p><span class="text-gray-400">Cooldown:</span> ${skill.cooldown}s</p>
              ${skill.description ? `<p class="text-gray-300">${skill.description}</p>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderQuestsGrid(quests) {
  return `
    <div class="mb-6">
      <h4 class="text-xl font-bold mb-3 text-rpg-gold">Quests (${quests.length})</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${quests.map(quest => `
          <div class="encyclopedia-card p-4 rounded-lg">
            <div class="flex items-center space-x-3 mb-2">
              <span class="text-2xl">📋</span>
              <h5 class="font-bold text-rpg-gold">${quest.name}</h5>
            </div>
            <div class="text-sm space-y-1">
              <p><span class="text-gray-400">Type:</span> ${quest.type}</p>
              <p><span class="text-gray-400">Level Req:</span> ${quest.level_requirement}</p>
              <p><span class="text-gray-400">NPC:</span> ${quest.npc}</p>
              <p><span class="text-gray-400">Location:</span> ${quest.location}</p>
              ${quest.description ? `<p class="text-gray-300">${quest.description}</p>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

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

window.runAccount = async function(id) {
  const acc = accounts.find(a => a.id === id);
  if (!acc) return;
  outputs[acc.id] = '';
  renderAccounts();
  running[acc.id] = true;
  automationState[acc.id] = 'running';
  renderAccounts();
  renderTabs();
  appendOutput(id, '⚔️ Warrior summoned to battle! (Window opened)\n');
  await ipcRenderer.invoke('start-automation', acc);
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
    // Start unscroll
    await ipcRenderer.invoke('start-unscroll', accounts.find(a => a.id === id));
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
  running[id] = false;
  renderAccounts();
  renderTabs();
  appendOutput(id, '⏹️ Warrior returned to barracks.\n');
};

document.getElementById('account-form').onsubmit = async function(e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();
  let id = document.getElementById('account-id').value;
  const config = getConfigFromForm();
  if (!username || !password) return;

  if (editingId) {
    // Update
    const idx = accounts.findIndex(a => a.id === editingId);
    if (idx !== -1) {
      accounts[idx].username = username;
      accounts[idx].password = password;
      accounts[idx].config = config;
    }
    editingId = null;
  } else {
    // Add
    id = Math.random().toString(36).substr(2, 9);
    accounts.push({ id, username, password, config });
  }
  await ipcRenderer.invoke('save-accounts', accounts);
  document.getElementById('account-form').reset();
  document.getElementById('form-title').innerHTML = '➕ Add New Warrior';
  document.getElementById('save-btn').innerHTML = '➕ Add Warrior';
  document.getElementById('cancel-btn').style.display = 'none';
  loadAccounts();
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