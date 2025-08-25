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
      case 'titles':
        data = await ipcRenderer.invoke('get-encyclopedia-titles');
        title = 'Titles';
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

window.showItemDetails = function(itemId) {
  // Find the item in the current encyclopedia data
  const item = encyclopediaData?.items?.find(i => i.id === itemId);
  if (!item) {
    console.error('Item not found:', itemId);
    return;
  }
  
  // Create and show modal
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.onclick = () => modal.remove();
  
  const modalContent = document.createElement('div');
  modalContent.className = 'bg-rpg-dark border-2 border-rpg-gold rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto';
  modalContent.onclick = (e) => e.stopPropagation();
  
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
          ${item.type === 'Recipe' ? '<span class="bg-green-500 text-white px-3 py-1 rounded-full text-sm">Recipe</span>' : ''}
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
  `;
  
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
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

window.loadAllEncyclopediaData = async function() {
  try {
    const [items, monsters, skills, titles, stats] = await Promise.all([
      ipcRenderer.invoke('get-encyclopedia-items'),
      ipcRenderer.invoke('get-encyclopedia-monsters'),
      ipcRenderer.invoke('get-encyclopedia-skills'),
      ipcRenderer.invoke('get-encyclopedia-titles'),
      ipcRenderer.invoke('get-encyclopedia-stats')
    ]);
    
    encyclopediaData = { items, monsters, skills, titles, stats };
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
        <hr/>
        ${Object.keys(item.requirements).length > 0 ? `
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
              <p><span class="text-gray-400">Type:</span> ${title.type}</p>
              <p><span class="text-gray-400">Level Req:</span> ${title.level_requirement}</p>
              <p><span class="text-gray-400">NPC:</span> ${title.npc}</p>
              <p><span class="text-gray-400">Location:</span> ${title.location}</p>
              ${title.description ? `<p class="text-gray-300">${title.description}</p>` : ''}
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