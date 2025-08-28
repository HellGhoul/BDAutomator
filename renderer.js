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
  titles: [],
  stats: null
};
let isCrawling = false;
let crawlProgress = 0;

// AI Resource Manager variables
let aiTargetItems = [];
let aiAnalysisResults = null;
let aiUserPreferences = {
  riskTolerance: 'medium',
  timePreference: 'efficient',
  resourcePriority: 'materials'
};

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

  // AI Resource Manager tab
  const aiTab = document.createElement('div');
  aiTab.className = `tab px-4 py-2 rounded-t-lg ${activeTab === 'ai' ? 'active' : ''}`;
  aiTab.innerHTML = '🧠 AI Resource Manager';
  aiTab.onclick = () => switchTab('ai');
  tabBar.appendChild(aiTab);

  // Encyclopedia tab
  const encyclopediaTab = document.createElement('div');
  encyclopediaTab.className = `tab px-4 py-2 rounded-t-lg ${activeTab === 'encyclopedia' ? 'active' : ''}`;
  encyclopediaTab.innerHTML = '📚 Encyclopedia';
  encyclopediaTab.onclick = () => switchTab('encyclopedia');
  tabBar.appendChild(encyclopediaTab);

  // Render tab content based on active tab
  if (activeTab === 'output' || !activeTab) {
    renderOutputTab();
  } else if (activeTab === 'ai') {
    renderAITab();
  } else if (activeTab === 'encyclopedia') {
    renderEncyclopediaTab();
  }
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

function renderAITab() {
  const tabContent = document.getElementById('tab-content');
  
  // AI Resource Manager tab content
  const aiDiv = document.createElement('div');
  aiDiv.className = 'p-4 h-[600px] overflow-y-auto';
  aiDiv.innerHTML = `
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-rpg-gold mb-4">🧠 AI Resource Manager</h2>
      <p class="text-gray-300 mb-4">AI-powered resource prediction, farming route optimization, and inventory management</p>
    </div>
    
    <!-- Target Items Section -->
    <div class="rpg-border rounded-lg p-4 mb-6">
      <h3 class="text-xl font-bold text-rpg-gold mb-3">🎯 Target Items</h3>
      <div class="flex flex-wrap gap-2 mb-3">
        <input type="text" id="target-item-input" placeholder="Enter item name..." 
               class="rpg-input flex-1 min-w-[200px]" />
        <button onclick="addTargetItem()" class="rpg-button px-4 py-2">Add Target</button>
      </div>
      <div id="target-items-list" class="space-y-2">
        <!-- Target items will be displayed here -->
      </div>
    </div>
    
    <!-- AI Analysis Section -->
    <div class="rpg-border rounded-lg p-4 mb-6">
      <h3 class="text-xl font-bold text-rpg-gold mb-3">🔍 AI Analysis</h3>
      <div class="flex gap-4 mb-4">
        <button onclick="runAIAnalysis()" class="rpg-button px-6 py-2 bg-green-900/50 border-green-500 text-green-300">
          🚀 Run AI Analysis
        </button>
        <button onclick="loadSampleData()" class="rpg-button px-4 py-2 bg-blue-900/50 border-blue-500 text-blue-300">
          📊 Load Sample Data
        </button>
        <button onclick="clearAIAnalysis()" class="rpg-button px-4 py-2 bg-red-900/50 border-red-500 text-red-300">
          🗑️ Clear Analysis
        </button>
      </div>
      <div id="ai-analysis-results" class="hidden">
        <!-- AI analysis results will be displayed here -->
      </div>
    </div>
    
    <!-- User Preferences Section -->
    <div class="rpg-border rounded-lg p-4 mb-6">
      <h3 class="text-xl font-bold text-rpg-gold mb-3">⚙️ AI Preferences</h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Risk Tolerance</label>
          <select id="risk-tolerance" class="rpg-input w-full">
            <option value="low">Low Risk</option>
            <option value="medium" selected>Medium Risk</option>
            <option value="high">High Risk</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Time Preference</label>
          <select id="time-preference" class="rpg-input w-full">
            <option value="efficient" selected>Efficient</option>
            <option value="safe">Safe</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Resource Priority</label>
          <select id="resource-priority" class="rpg-input w-full">
            <option value="materials" selected>Materials</option>
            <option value="experience">Experience</option>
            <option value="gold">Gold</option>
          </select>
        </div>
      </div>
      <button onclick="updateAIPreferences()" class="rpg-button px-4 py-2 mt-3">
        🔄 Update Preferences
      </button>
    </div>
    
    <!-- Quick Actions -->
    <div class="rpg-border rounded-lg p-4">
      <h3 class="text-xl font-bold text-rpg-gold mb-3">⚡ Quick Actions</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button onclick="optimizeInventory()" class="rpg-button p-4 text-center">
          <div class="text-2xl mb-2">🔄</div>
          <div class="font-bold">Inventory Optimization</div>
          <div class="text-sm text-gray-400">Get AI suggestions for inventory management</div>
        </button>
        <button onclick="generateFarmingRoute()" class="rpg-button p-4 text-center">
          <div class="text-2xl mb-2">🗺️</div>
          <div class="font-bold">Farming Routes</div>
          <div class="text-sm text-gray-400">Get optimal farming sequences</div>
        </button>
      </div>
    </div>
  `;
  tabContent.appendChild(aiDiv);
  
  // Initialize target items display
  updateTargetItemsDisplay();
}

function renderEncyclopediaTab() {
  const tabContent = document.getElementById('tab-content');
  
  // Encyclopedia tab content
  const encyclopediaDiv = document.createElement('div');
  encyclopediaDiv.className = 'p-4 h-[600px] overflow-y-auto';
  encyclopediaDiv.innerHTML = `
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-rpg-gold mb-4">📚 Encyclopedia Data</h2>
      <p class="text-gray-300 mb-4">Browse collected game data and information</p>
    </div>
    
    <!-- Statistics Dashboard -->
    <div class="rpg-border rounded-lg p-4 mb-6">
      <h3 class="text-xl font-bold text-rpg-gold mb-3">📊 Data Statistics</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="text-center p-3 bg-rpg-darker/50 rounded">
          <div class="text-2xl font-bold text-blue-400">${encyclopediaData?.items?.length || 0}</div>
          <div class="text-sm text-gray-400">Items</div>
        </div>
        <div class="text-center p-3 bg-rpg-darker/50 rounded">
          <div class="text-2xl font-bold text-green-400">${encyclopediaData?.monsters?.length || 0}</div>
          <div class="text-sm text-gray-400">Monsters</div>
        </div>
        <div class="text-center p-3 bg-rpg-darker/50 rounded">
          <div class="text-2xl font-bold text-purple-400">${encyclopediaData?.skills?.length || 0}</div>
          <div class="text-sm text-gray-400">Skills</div>
        </div>
        <div class="text-center p-3 bg-rpg-darker/50 rounded">
          <div class="text-2xl font-bold text-yellow-400">${encyclopediaData?.titles?.length || 0}</div>
          <div class="text-sm text-gray-400">Titles</div>
        </div>
      </div>
    </div>
    
    <!-- Search and Filter -->
    <div class="rpg-border rounded-lg p-4 mb-6">
      <h3 class="text-xl font-bold text-rpg-gold mb-3">🔍 Search & Filter</h3>
      <div class="flex gap-4 mb-4">
        <input type="text" id="encyclopedia-search" placeholder="Search items, monsters, skills..." 
               class="rpg-input flex-1" />
        <select id="encyclopedia-filter" class="rpg-input">
          <option value="all">All Types</option>
          <option value="items">Items</option>
          <option value="monsters">Monsters</option>
          <option value="skills">Skills</option>
          <option value="titles">Titles</option>
        </select>
        <button onclick="searchEncyclopedia()" class="rpg-button px-4 py-2">🔍 Search</button>
      </div>
    </div>
    
    <!-- Data Display -->
    <div id="encyclopedia-data-display" class="rpg-border rounded-lg p-4">
      <div class="text-center text-gray-400 mt-8">
        <div class="text-lg">🔍 Use the search above to find specific data</div>
        <div class="text-sm mt-2">Or browse by category using the filter</div>
      </div>
    </div>
  `;
  tabContent.appendChild(encyclopediaDiv);
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
            ${encyclopediaData?.skills?.length || 0} skills, 
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
window.searchEncyclopedia = async function() {
  const query = document.getElementById('encyclopedia-search').value.trim();
  if (!query) return;

  try {
    // Search in the current encyclopedia data
    if (encyclopediaData && encyclopediaData.items) {
      const searchResults = encyclopediaData.items.filter(item => {
        const searchText = query.toLowerCase();
        return (
          item.name.toLowerCase().includes(searchText) ||
          item.type.toLowerCase().includes(searchText) ||
          (item.requirements.Class && item.requirements.Class.toLowerCase().includes(searchText)) ||
          (item.description && item.description.toLowerCase().includes(searchText)) ||
          (item.plainAttributes && item.plainAttributes.some(attr => attr.toLowerCase().includes(searchText))) ||
          (item.plainReq && item.plainReq.some(req => req.toLowerCase().includes(searchText)))
        );
      });
      
      displayEncyclopediaResults({ items: searchResults }, `Search results for: "${query}" (${searchResults.length} items)`);
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
      case 'skills':
        console.log('⚡ Fetching skills...');
        data = await ipcRenderer.invoke('get-encyclopedia-skills');
        title = 'Skills';
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
    const [items, monsters, skills, titles, stats] = await Promise.all([
      ipcRenderer.invoke('get-encyclopedia-items'),
      ipcRenderer.invoke('get-encyclopedia-monsters'),
      ipcRenderer.invoke('get-encyclopedia-skills'),
      ipcRenderer.invoke('get-encyclopedia-titles'),
      ipcRenderer.invoke('get-encyclopedia-stats')
    ]);
    
    console.log('📊 Data loaded:', {
      items: items?.length || 0,
      monsters: monsters?.length || 0,
      skills: skills?.length || 0,
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
    
    encyclopediaData = { items, monsters, skills, titles, stats };
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
  if (results.skills && results.skills.length > 0) {
    html += renderSkillsGrid(results.skills);
  }
  if (results.titles && results.titles.length > 0) {
    html += renderTitlesGrid(results.titles);
  }
  
  if (results.total === 0 || (!results.items && !results.monsters && !results.skills && !results.titles)) {
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

function renderTitlesGrid(titles) {
  return `
    <div class="mb-6">
      <h4 class="text-xl font-bold mb-3 text-rpg-gold">Titles (${titles.length})</h4>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

// AI Resource Manager Functions
window.addTargetItem = function() {
  const input = document.getElementById('target-item-input');
  const itemName = input.value.trim();
  
  if (itemName && !aiTargetItems.includes(itemName)) {
    aiTargetItems.push(itemName);
    input.value = '';
    updateTargetItemsDisplay();
    console.log(`🎯 Added target item: ${itemName}`);
  }
};

window.removeTargetItem = function(itemName) {
  const index = aiTargetItems.indexOf(itemName);
  if (index > -1) {
    aiTargetItems.splice(index, 1);
    updateTargetItemsDisplay();
    console.log(`🗑️ Removed target item: ${itemName}`);
  }
};

window.updateTargetItemsDisplay = function() {
  const list = document.getElementById('target-items-list');
  if (!list) return;
  
  if (aiTargetItems.length === 0) {
    list.innerHTML = '<p class="text-gray-400 text-sm">No target items set. Add items above to get AI recommendations.</p>';
    return;
  }
  
  list.innerHTML = aiTargetItems.map(item => `
    <div class="flex items-center justify-between p-2 bg-rpg-darker/50 rounded">
      <span class="text-gray-200">${item}</span>
      <button onclick="removeTargetItem('${item}')" class="text-red-400 hover:text-red-300 text-sm">
        🗑️ Remove
      </button>
    </div>
  `).join('');
};

window.runAIAnalysis = async function() {
  if (aiTargetItems.length === 0) {
    alert('Please add target items first!');
    return;
  }
  
  console.log('🧠 Running AI analysis...');
  
  // Show loading state
  const resultsDiv = document.getElementById('ai-analysis-results');
  resultsDiv.classList.remove('hidden');
  resultsDiv.innerHTML = `
    <div class="text-center text-gray-400 py-8">
      <div class="text-lg">🧠 AI is analyzing your resources...</div>
      <div class="text-sm mt-2">This may take a few moments</div>
    </div>
  `;
  
  try {
    // In a real implementation, this would call the AI Resource Manager
    // For now, we'll simulate the analysis
    await simulateAIAnalysis();
    
    // Display results
    displayAIAnalysisResults();
    
  } catch (error) {
    console.error('AI analysis failed:', error);
    resultsDiv.innerHTML = `
      <div class="text-center text-red-400 py-8">
        <div class="text-lg">❌ AI analysis failed</div>
        <div class="text-sm mt-2">${error.message}</div>
      </div>
    `;
  }
};

window.simulateAIAnalysis = async function() {
  // Simulate AI processing time
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Generate mock analysis results
  aiAnalysisResults = {
    timestamp: new Date(),
    targetItems: aiTargetItems,
    materialRequirements: new Map([
      ['Celestial Stone', {
        name: 'Celestial Stone',
        required: 5,
        current: 3,
        needed: 2,
        priority: 9,
        rarity: 'legendary',
        source: { monster: 'Ancient Behemoth', location: 'Behemoth areas' },
        estimatedFarmingTime: 45
      }],
      ['Damned Fortune', {
        name: 'Damned Fortune',
        required: 3,
        current: 1,
        needed: 2,
        priority: 7,
        rarity: 'epic',
        source: { monster: 'Hell ghoul', location: 'Hell areas' },
        estimatedFarmingTime: 30
      }]
    ]),
    farmingRecommendations: [
      {
        location: 'Behemoth areas',
        materials: ['Celestial Stone'],
        totalTime: 45,
        priority: 9,
        efficiency: 0.2,
        route: [
          {
            step: 1,
            material: 'Celestial Stone',
            monster: 'Ancient Behemoth',
            estimatedTime: 45,
            priority: 9,
            notes: ['High priority - legendary material']
          }
        ]
      },
      {
        location: 'Hell areas',
        materials: ['Damned Fortune'],
        totalTime: 30,
        priority: 7,
        efficiency: 0.23,
        route: [
          {
            step: 1,
            material: 'Damned Fortune',
            monster: 'Hell ghoul',
            estimatedTime: 30,
            priority: 7,
            notes: ['Epic material needed']
          }
        ]
      }
    ],
    inventoryOptimization: [
      {
        action: 'prioritize_farming',
        item: 'Celestial Stone',
        needed: 2,
        priority: 9,
        reason: 'High priority material for crafting',
        estimatedTime: 45,
        priority: 'high'
      }
    ],
    estimatedTime: 75,
    riskAssessment: 'medium'
  };
};

window.displayAIAnalysisResults = function() {
  if (!aiAnalysisResults) return;
  
  const resultsDiv = document.getElementById('ai-analysis-results');
  
  resultsDiv.innerHTML = `
    <div class="space-y-6">
      <!-- Summary -->
      <div class="rpg-border rounded-lg p-4">
        <h4 class="text-lg font-bold text-rpg-gold mb-3">📊 Analysis Summary</h4>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="text-center">
            <div class="text-2xl font-bold text-blue-400">${aiAnalysisResults.materialRequirements.size}</div>
            <div class="text-sm text-gray-400">Materials Needed</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-green-400">${aiAnalysisResults.estimatedTime}</div>
            <div class="text-sm text-gray-400">Minutes</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-yellow-400">${aiAnalysisResults.riskAssessment.toUpperCase()}</div>
            <div class="text-sm text-gray-400">Risk Level</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-purple-400">${aiAnalysisResults.farmingRecommendations.length}</div>
            <div class="text-sm text-gray-400">Locations</div>
          </div>
        </div>
      </div>
      
      <!-- Material Requirements -->
      <div class="rpg-border rounded-lg p-4">
        <h4 class="text-lg font-bold text-rpg-gold mb-3">📋 Material Requirements</h4>
        <div class="space-y-3">
          ${Array.from(aiAnalysisResults.materialRequirements.values())
            .sort((a, b) => b.priority - a.priority)
            .map(material => `
              <div class="flex items-center justify-between p-3 bg-rpg-darker/30 rounded">
                <div>
                  <div class="font-medium text-gray-200">${material.name}</div>
                  <div class="text-sm text-gray-400">
                    Priority: ${material.priority} | Rarity: ${material.rarity} | 
                    Needed: ${material.needed} | Current: ${material.current}
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-sm text-gray-400">${material.source.monster}</div>
                  <div class="text-xs text-gray-500">${material.source.location}</div>
                </div>
              </div>
            `).join('')}
        </div>
      </div>
      
      <!-- Farming Recommendations -->
      <div class="rpg-border rounded-lg p-4">
        <h4 class="text-lg font-bold text-rpg-gold mb-3">🗺️ Optimal Farming Routes</h4>
        <div class="space-y-4">
          ${aiAnalysisResults.farmingRecommendations.map((rec, index) => `
            <div class="p-3 bg-rpg-darker/30 rounded">
              <div class="flex items-center justify-between mb-2">
                <h5 class="font-medium text-gray-200">${index + 1}. ${rec.location}</h5>
                <div class="text-sm text-gray-400">
                  ${rec.materials.length} materials | ${rec.totalTime} min | 
                  Efficiency: ${rec.efficiency.toFixed(2)}
                </div>
              </div>
              <div class="space-y-2">
                ${rec.route.map(step => `
                  <div class="ml-4 text-sm">
                    <span class="text-gray-300">${step.step}. ${step.material}</span>
                    <span class="text-gray-500 ml-2">(${step.monster} - ${step.estimatedTime} min)</span>
                    ${step.notes.length > 0 ? `<div class="text-xs text-gray-500 ml-4">${step.notes.join(', ')}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- Inventory Optimization -->
      <div class="rpg-border rounded-lg p-4">
        <h4 class="text-lg font-bold text-rpg-gold mb-3">🔄 Inventory Optimization</h4>
        <div class="space-y-3">
          ${aiAnalysisResults.inventoryOptimization.map((suggestion, index) => `
            <div class="flex items-center justify-between p-3 bg-rpg-darker/30 rounded">
              <div>
                <div class="font-medium text-gray-200">${suggestion.action.replace('_', ' ').toUpperCase()}: ${suggestion.item}</div>
                <div class="text-sm text-gray-400">${suggestion.reason}</div>
              </div>
              <div class="text-right">
                <div class="text-sm text-gray-400">Priority: ${suggestion.priority}</div>
                ${suggestion.estimatedTime ? `<div class="text-xs text-gray-500">${suggestion.estimatedTime} min</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
};

window.loadSampleData = function() {
  // Load sample target items
  aiTargetItems = [
    "Hell ghoul's (III) Celestial Stone",
    "Steel Dragon's Platinum Ring (III)",
    "Azure dragon's Nefârtatul's Ring (III)"
  ];
  
  updateTargetItemsDisplay();
  console.log('📊 Loaded sample target items');
};

window.clearAIAnalysis = function() {
  aiTargetItems = [];
  aiAnalysisResults = null;
  updateTargetItemsDisplay();
  
  const resultsDiv = document.getElementById('ai-analysis-results');
  if (resultsDiv) {
    resultsDiv.classList.add('hidden');
  }
  
  console.log('🗑️ Cleared AI analysis data');
};

window.updateAIPreferences = function() {
  aiUserPreferences.riskTolerance = document.getElementById('risk-tolerance').value;
  aiUserPreferences.timePreference = document.getElementById('time-preference').value;
  aiUserPreferences.resourcePriority = document.getElementById('resource-priority').value;
  
  console.log('⚙️ Updated AI preferences:', aiUserPreferences);
  alert('AI preferences updated!');
};

window.optimizeInventory = function() {
  if (!aiAnalysisResults) {
    alert('Please run AI analysis first!');
    return;
  }
  
  // Show inventory optimization results
  const resultsDiv = document.getElementById('ai-analysis-results');
  resultsDiv.scrollIntoView({ behavior: 'smooth' });
  
  // Highlight inventory section
  const inventorySection = resultsDiv.querySelector('.rpg-border:last-child');
  if (inventorySection) {
    inventorySection.style.borderColor = '#F59E0B';
    setTimeout(() => {
      inventorySection.style.borderColor = '#4A5568';
    }, 3000);
  }
};

window.generateFarmingRoute = function() {
  if (!aiAnalysisResults) {
    alert('Please run AI analysis first!');
    return;
  }
  
  // Show farming recommendations
  const resultsDiv = document.getElementById('ai-analysis-results');
  resultsDiv.scrollIntoView({ behavior: 'smooth' });
  
  // Highlight farming section
  const farmingSection = resultsDiv.querySelector('.rpg-border:nth-child(3)');
  if (farmingSection) {
    farmingSection.style.borderColor = '#10B981';
    setTimeout(() => {
      farmingSection.style.borderColor = '#4A5568';
    }, 3000);
  }
};

window.searchEncyclopedia = function() {
  const searchTerm = document.getElementById('encyclopedia-search').value.toLowerCase();
  const filterType = document.getElementById('encyclopedia-filter').value;
  
  if (!searchTerm) {
    document.getElementById('encyclopedia-data-display').innerHTML = `
      <div class="text-center text-gray-400 mt-8">
        <div class="text-lg">🔍 Use the search above to find specific data</div>
        <div class="text-sm mt-2">Or browse by category using the filter</div>
      </div>
    `;
    return;
  }
  
  // Simple search implementation
  let results = [];
  
  if (filterType === 'all' || filterType === 'items') {
    results.push(...encyclopediaData.items.filter(item => 
      item.name.toLowerCase().includes(searchTerm)
    ).slice(0, 10));
  }
  
  if (filterType === 'all' || filterType === 'monsters') {
    results.push(...encyclopediaData.monsters.filter(monster => 
      monster.name.toLowerCase().includes(searchTerm)
    ).slice(0, 10));
  }
  
  if (filterType === 'all' || filterType === 'titles') {
    results.push(...encyclopediaData.titles.filter(title => 
      title.name.toLowerCase().includes(searchTerm)
    ).slice(0, 10));
  }
  
  if (results.length === 0) {
    document.getElementById('encyclopedia-data-display').innerHTML = `
      <div class="text-center text-gray-400 mt-8">
        <div class="text-lg">🔍 No results found</div>
        <div class="text-sm mt-2">Try a different search term or filter</div>
      </div>
    `;
    return;
  }
  
  // Display results
  const resultsHtml = results.map(item => `
    <div class="p-3 bg-rpg-darker/30 rounded mb-2">
      <div class="font-medium text-gray-200">${item.name}</div>
      <div class="text-sm text-gray-400">Type: ${item.type || 'Unknown'}</div>
      ${item.rarity ? `<div class="text-xs text-gray-500">Rarity: ${item.rarity}</div>` : ''}
    </div>
  `).join('');
  
  document.getElementById('encyclopedia-data-display').innerHTML = `
    <div class="mb-4">
      <h4 class="text-lg font-bold text-rpg-gold">Search Results (${results.length})</h4>
      <p class="text-sm text-gray-400">Found ${results.length} results for "${searchTerm}"</p>
    </div>
    <div class="space-y-2">
      ${resultsHtml}
    </div>
  `;
}; 