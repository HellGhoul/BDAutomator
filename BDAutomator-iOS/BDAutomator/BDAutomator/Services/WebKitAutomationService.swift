import Foundation
import WebKit
import Combine

class WebKitAutomationService: NSObject, ObservableObject {
    @Published var isRunning = false
    @Published var currentStatus = "Ready"
    @Published var logs: [String] = []
    
    private var webView: WKWebView?
    private var automationTimer: Timer?
    private var currentAccount: Account?
    private var collectibles: [String] = []
    
    // MARK: - Initialization
    
    override init() {
        super.init()
        loadCollectibles()
    }
    
    private func loadCollectibles() {
        if let path = Bundle.main.path(forResource: "collectibles", ofType: "txt"),
           let content = try? String(contentsOfFile: path, encoding: .utf8) {
            collectibles = content.components(separatedBy: .newlines).filter { !$0.isEmpty }
        }
    }
    
    // MARK: - WebView Setup
    
    func setupWebView() -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        
        // Inject automation scripts
        let script = WKUserScript(
            source: automationJavaScript,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: false
        )
        configuration.userContentController.addUserScript(script)
        
        self.webView = webView
        return webView
    }
    
    // MARK: - Automation Control
    
    func startAutomation(for account: Account) {
        guard !isRunning else { return }
        
        currentAccount = account
        isRunning = true
        currentStatus = "Starting automation..."
        
        addLog("🚀 Starting automation for \(account.username)")
        
        // Navigate to game
        let url = URL(string: "https://blackdragon.mobi/")!
        webView?.load(URLRequest(url: url))
        
        // Start automation loop
        startAutomationLoop()
    }
    
    func stopAutomation() {
        isRunning = false
        currentStatus = "Stopped"
        automationTimer?.invalidate()
        automationTimer = nil
        
        addLog("⏹️ Automation stopped")
    }
    
    func pauseAutomation() {
        isRunning = false
        currentStatus = "Paused"
        automationTimer?.invalidate()
        automationTimer = nil
        
        addLog("⏸️ Automation paused")
    }
    
    func resumeAutomation() {
        guard let account = currentAccount else { return }
        startAutomation(for: account)
    }
    
    // MARK: - Automation Loop
    
    private func startAutomationLoop() {
        automationTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.performAutomationStep()
        }
    }
    
    private func performAutomationStep() {
        guard isRunning, let webView = webView else { return }
        
        // Check if we need to login
        webView.evaluateJavaScript("document.querySelector('input[name=username]') !== null") { [weak self] result, error in
            if let isLoginPage = result as? Bool, isLoginPage {
                self?.performLogin()
            } else {
                self?.performGameAutomation()
            }
        }
    }
    
    private func performLogin() {
        guard let account = currentAccount, let webView = webView else { return }
        
        addLog("🔐 Logging in...")
        
        let loginScript = """
        document.querySelector('input[name=username]').value = '\(account.username)';
        document.querySelector('input[name=password]').value = '\(account.password)';
        document.querySelector('.button').click();
        """
        
        webView.evaluateJavaScript(loginScript) { [weak self] _, error in
            if let error = error {
                self?.addLog("❌ Login error: \(error.localizedDescription)")
            } else {
                self?.addLog("✅ Login successful")
                self?.currentStatus = "Logged in - Starting game automation"
            }
        }
    }
    
    private func performGameAutomation() {
        guard let webView = webView else { return }
        
        // Check battle status and continue
        let battleScript = """
        const battleText = document.querySelector('body > div.main > strong')?.textContent || '';
        if (battleText.includes('Congratulations! You won the battle!') || 
            battleText.includes('You lost the battle.')) {
            document.querySelector('body > div.main > form > input')?.click();
            return 'battle_continued';
        } else if (battleText.includes('Congratulations! You KILLED')) {
            return 'monster_killed';
        } else {
            return 'in_battle';
        }
        """
        
        webView.evaluateJavaScript(battleScript) { [weak self] result, error in
            if let status = result as? String {
                self?.handleBattleStatus(status)
            }
        }
    }
    
    private func handleBattleStatus(_ status: String) {
        switch status {
        case "battle_continued":
            addLog("🔄 Battle continued")
            currentStatus = "In battle..."
        case "monster_killed":
            addLog("💀 Monster killed!")
            currentStatus = "Monster defeated"
            handleLootCollection()
        case "in_battle":
            currentStatus = "Fighting..."
        default:
            break
        }
    }
    
    private func handleLootCollection() {
        guard let webView = webView else { return }
        
        let lootScript = """
        const lootLink = document.querySelector('body > div.main > a');
        if (lootLink) {
            return lootLink.textContent;
        }
        return null;
        """
        
        webView.evaluateJavaScript(lootScript) { [weak self] result, error in
            if let lootName = result as? String {
                self?.addLog("🎁 Loot found: \(lootName)")
            }
        }
    }
    
    // MARK: - Helper Methods
    
    private func addLog(_ message: String) {
        DispatchQueue.main.async {
            self.logs.insert(message, at: 0)
            if self.logs.count > 100 {
                self.logs = Array(self.logs.prefix(100))
            }
            
            // Save to Core Data
            if let account = self.currentAccount {
                CoreDataManager.shared.addLog(to: account, message: message)
            }
        }
    }
    
    // MARK: - JavaScript Injection
    
    private var automationJavaScript: String {
        return """
        // Automation helper functions
        window.BDAutomator = {
            waitForElement: function(selector, timeout = 5000) {
                return new Promise((resolve, reject) => {
                    const element = document.querySelector(selector);
                    if (element) {
                        resolve(element);
                        return;
                    }
                    
                    const observer = new MutationObserver((mutations, obs) => {
                        const element = document.querySelector(selector);
                        if (element) {
                            obs.disconnect();
                            resolve(element);
                        }
                    });
                    
                    observer.observe(document.body, {
                        childList: true,
                        subtree: true
                    });
                    
                    setTimeout(() => {
                        observer.disconnect();
                        reject(new Error('Element not found'));
                    }, timeout);
                });
            },
            
            clickElement: function(selector) {
                const element = document.querySelector(selector);
                if (element) {
                    element.click();
                    return true;
                }
                return false;
            },
            
            getText: function(selector) {
                const element = document.querySelector(selector);
                return element ? element.textContent : '';
            }
        };
        """
    }
}

// MARK: - WKNavigationDelegate

extension WebKitAutomationService: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        addLog("🌐 Page loaded: \(webView.url?.absoluteString ?? "Unknown")")
    }
    
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        addLog("❌ Navigation failed: \(error.localizedDescription)")
    }
}

// MARK: - WKUIDelegate

extension WebKitAutomationService: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // Handle popup windows
        let popupWebView = WKWebView(frame: .zero, configuration: configuration)
        popupWebView.navigationDelegate = self
        return popupWebView
    }
}
