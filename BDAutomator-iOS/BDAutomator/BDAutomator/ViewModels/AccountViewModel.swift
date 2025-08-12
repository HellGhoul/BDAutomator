import Foundation
import Combine
import CoreData

class AccountViewModel: ObservableObject {
    @Published var accounts: [NSManagedObject] = []
    @Published var selectedAccount: NSManagedObject?
    @Published var isAddingAccount = false
    @Published var editingAccount: NSManagedObject?
    
    private let coreDataManager = CoreDataManager.shared
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        loadAccounts()
    }
    
    // MARK: - Account Management
    
    func loadAccounts() {
        accounts = coreDataManager.fetchAccounts()
    }
    
    func addAccount(username: String, password: String, config: [String: Any]) {
        let account = coreDataManager.createAccount(username: username, password: password, config: config)
        accounts.append(account)
        isAddingAccount = false
    }
    
    func updateAccount(_ account: NSManagedObject, username: String, password: String, config: [String: Any]) {
        account.setValue(username, forKey: "username")
        account.setValue(password, forKey: "password")
        
        if let accountConfig = account.value(forKey: "config") as? NSManagedObject {
            accountConfig.setValue(config["all"] as? Bool ?? false, forKey: "all")
            accountConfig.setValue(config["recipe"] as? Bool ?? false, forKey: "recipe")
            accountConfig.setValue(config["charm"] as? Bool ?? false, forKey: "charm")
            accountConfig.setValue(config["pieceGear"] as? Bool ?? false, forKey: "pieceGear")
            accountConfig.setValue(config["jewel"] as? Bool ?? false, forKey: "jewel")
            accountConfig.setValue(config["rune"] as? Bool ?? false, forKey: "rune")
            accountConfig.setValue(config["epicGear"] as? Bool ?? false, forKey: "epicGear")
            accountConfig.setValue(config["magicScroll"] as? Bool ?? false, forKey: "magicScroll")
            accountConfig.setValue(config["monsterScroll"] as? Bool ?? false, forKey: "monsterScroll")
            accountConfig.setValue(config["staminaPotion"] as? Bool ?? false, forKey: "staminaPotion")
            accountConfig.setValue(config["ancientPotion"] as? Bool ?? false, forKey: "ancientPotion")
            accountConfig.setValue(config["itemList"] as? String ?? "", forKey: "itemList")
        }
        
        coreDataManager.save()
        editingAccount = nil
        loadAccounts()
    }
    
    func deleteAccount(_ account: NSManagedObject) {
        if let index = accounts.firstIndex(of: account) {
            accounts.remove(at: index)
            coreDataManager.deleteAccount(account)
        }
    }
    
    func selectAccount(_ account: NSManagedObject) {
        selectedAccount = account
    }
    
    // MARK: - Configuration Helpers
    
    func getDefaultConfig() -> [String: Any] {
        return [
            "all": false,
            "recipe": true,
            "charm": false,
            "pieceGear": false,
            "jewel": false,
            "rune": false,
            "epicGear": false,
            "magicScroll": false,
            "monsterScroll": true,
            "staminaPotion": false,
            "ancientPotion": false,
            "itemList": ""
        ]
    }
    
    func getConfigFromAccount(_ account: NSManagedObject) -> [String: Any] {
        guard let config = account.value(forKey: "config") as? NSManagedObject else { return getDefaultConfig() }
        
        return [
            "all": config.value(forKey: "all") as? Bool ?? false,
            "recipe": config.value(forKey: "recipe") as? Bool ?? false,
            "charm": config.value(forKey: "charm") as? Bool ?? false,
            "pieceGear": config.value(forKey: "pieceGear") as? Bool ?? false,
            "jewel": config.value(forKey: "jewel") as? Bool ?? false,
            "rune": config.value(forKey: "rune") as? Bool ?? false,
            "epicGear": config.value(forKey: "epicGear") as? Bool ?? false,
            "magicScroll": config.value(forKey: "magicScroll") as? Bool ?? false,
            "monsterScroll": config.value(forKey: "monsterScroll") as? Bool ?? false,
            "staminaPotion": config.value(forKey: "staminaPotion") as? Bool ?? false,
            "ancientPotion": config.value(forKey: "ancientPotion") as? Bool ?? false,
            "itemList": config.value(forKey: "itemList") as? String ?? ""
        ]
    }
    
    // MARK: - Account Status
    
    func getAccountStatus(_ account: NSManagedObject) -> String {
        return account.value(forKey: "automationStatus") as? String ?? "stopped"
    }
    
    func getAccountStatusColor(_ account: NSManagedObject) -> String {
        let status = getAccountStatus(account)
        switch status {
        case "running":
            return "green"
        case "paused":
            return "yellow"
        case "stopped":
            return "red"
        default:
            return "gray"
        }
    }
    
    // MARK: - Validation
    
    func validateAccount(username: String, password: String) -> Bool {
        return !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
               !password.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    
    func isUsernameTaken(_ username: String, excluding currentAccount: NSManagedObject? = nil) -> Bool {
        return accounts.contains { account in
            let accountUsername = account.value(forKey: "username") as? String ?? ""
            return accountUsername.lowercased() == username.lowercased() && account != currentAccount
        }
    }
    
    // MARK: - Helper Methods
    
    func getAccountUsername(_ account: NSManagedObject) -> String {
        return account.value(forKey: "username") as? String ?? ""
    }
    
    func getAccountLastLogin(_ account: NSManagedObject) -> Date? {
        return account.value(forKey: "lastLogin") as? Date
    }
}

