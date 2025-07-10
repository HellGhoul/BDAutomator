const { ipcRenderer } = require('electron');

let accounts = [];
let running = {};
let editingId = null;
let outputs = {};
let webviews = {};
let activeTab = null;
let automationRunning = {}; // Track automation state per account

function renderAccounts() {
  const list = document.getElementById('account-list');
  list.innerHTML = '';
  accounts.forEach(acc => {
    const div = document.createElement('div');
    div.className = `rpg-border rounded-lg p-4 ${running[acc.id] ? 'bg-green-900/20' : 'bg-rpg-darker'} transition-all duration-300`;
    div.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center space-x-3">
          <span class="text-2xl">${running[acc.id] ? '⚔️' : '🛡️'}</span>
          <div>
            <h3 class="text-xl font-bold text-rpg-gold">${acc.username}</h3>
            <p class="text-sm text-gray-400">Level: ${acc.options ? JSON.stringify(acc.options) : '{}'} </p>
            ${automationRunning[acc.id] ? '<p class="text-sm text-green-400">🤖 Auto: ON</p>' : ''}
          </div>
        </div>
        <div class="flex space-x-2">
          <button onclick="editAccount('${acc.id}')" 
                  class="rpg-button px-3 py-1 rounded text-sm">✏️ Edit</button>
          <button onclick="deleteAccount('${acc.id}')" 
                  class="rpg-button px-3 py-1 rounded text-sm bg-red-900/50 border-red-500 text-red-300 hover:bg-red-700">🗑️ Delete</button>
          <button onclick="runAccount('${acc.id}')" ${running[acc.id] ? 'disabled' : ''} 
                  class="rpg-button px-3 py-1 rounded text-sm ${running[acc.id] ? 'opacity-50 cursor-not-allowed' : ''}">⚡ Run</button>
          <button onclick="toggleAutomation('${acc.id}')" ${!running[acc.id] ? 'disabled' : ''} 
                  class="rpg-button px-3 py-1 rounded text-sm ${automationRunning[acc.id] ? 'bg-green-900/50 border-green-500 text-green-300' : ''}">🤖 ${automationRunning[acc.id] ? 'Stop Auto' : 'Start Auto'}</button>
          <button onclick="stopAccount('${acc.id}')" ${running[acc.id] ? '' : 'disabled'} 
                  class="rpg-button px-3 py-1 rounded text-sm ${running[acc.id] ? '' : 'opacity-50 cursor-not-allowed'} bg-red-900/50 border-red-500 text-red-300 hover:bg-red-700">⏹️ Stop</button>
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

  // Only show the terminal/output tab
  const outputTab = document.createElement('div');
  outputTab.className = `tab px-4 py-2 rounded-t-lg active`;
  outputTab.innerHTML = '📜 Terminal/Output';
  outputTab.onclick = () => switchTab('output');
  tabBar.appendChild(outputTab);

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
  automationRunning = {};
  renderAccounts();
  for (const acc of accounts) {
    running[acc.id] = await ipcRenderer.invoke('is-running', acc.id);
    automationRunning[acc.id] = await ipcRenderer.invoke('is-automation-running', acc.id);
  }
  renderAccounts();
  renderTabs();
}

window.editAccount = function(id) {
  const acc = accounts.find(a => a.id === id);
  if (!acc) return;
  editingId = id;
  document.getElementById('form-title').innerHTML = '✏️ Edit Warrior';
  document.getElementById('username').value = acc.username;
  document.getElementById('password').value = acc.password;
  document.getElementById('account-id').value = acc.id;
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
  renderAccounts();
  renderTabs();
  appendOutput(id, '⚔️ Warrior summoned to battle! (Window opened)\n');
  // Open a new window for this account (handled by main.js)
  await ipcRenderer.invoke('start-automation', acc);
};

window.toggleAutomation = async function(id) {
  console.log('toggleAutomation called for', id);
  const acc = accounts.find(a => a.id === id);
  if (!acc) return;
  if (automationRunning[id]) {
    // Stop automation
    await ipcRenderer.send('stop-auto-script', { accountId: id });
    automationRunning[id] = false;
    appendOutput(id, '🤖 Automation stopped - Warrior resting.\n');
  } else {
    // Start automation in the automation window
    await ipcRenderer.send('start-auto-script', { accountId: id });
    automationRunning[id] = true;
    appendOutput(id, '🤖 Automation started - Warrior is auto-fighting!\n');
  }
  renderAccounts();
  renderTabs();
};

window.stopAccount = async function(id) {
  // Stop automation first if running
  if (automationRunning[id]) {
    await ipcRenderer.invoke('stop-automation', id);
    automationRunning[id] = false;
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
  if (!username || !password) return;

  if (editingId) {
    // Update
    const idx = accounts.findIndex(a => a.id === editingId);
    if (idx !== -1) {
      accounts[idx].username = username;
      accounts[idx].password = password;
      // Add more options here if needed
    }
    editingId = null;
  } else {
    // Add
    id = Math.random().toString(36).substr(2, 9);
    accounts.push({ id, username, password, options: {} });
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
  automationRunning[accountId] = false;
  running[accountId] = false;
  renderAccounts();
  renderTabs();
  appendOutput(accountId, '[Puppeteer] Automation process ended.\n');
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