import Foundation
import Combine
import CoreData

class AccountViewModel: ObservableObject {
    @Published var accounts: [Account] = []
    @Published var selectedAccount: Account?
    @Published var isAddingAccount = false
    @Published var editingAccount: Account?
    
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
    
    func updateAccount(_ account: Account, username: String, password: String, config: [String: Any]) {
        account.username = username
        account.password = password
        
        account.config.all = config["all"] as? Bool ?? false
        account.config.recipe = config["recipe"] as? Bool ?? false
        account.config.charm = config["charm"] as? Bool ?? false
        account.config.pieceGear = config["pieceGear"] as? Bool ?? false
        account.config.jewel = config["jewel"] as? Bool ?? false
        account.config.rune = config["rune"] as? Bool ?? false
        account.config.epicGear = config["epicGear"] as? Bool ?? false
        account.config.magicScroll = config["magicScroll"] as? Bool ?? false
        account.config.monsterScroll = config["monsterScroll"] as? Bool ?? false
        account.config.staminaPotion = config["staminaPotion"] as? Bool ?? false
        account.config.ancientPotion = config["ancientPotion"] as? Bool ?? false
        account.config.itemList = config["itemList"] as? String ?? ""
        
        coreDataManager.save()
        editingAccount = nil
        loadAccounts()
    }
    
    func deleteAccount(_ account: Account) {
        if let index = accounts.firstIndex(of: account) {
            accounts.remove(at: index)
            coreDataManager.deleteAccount(account)
        }
    }
    
    func selectAccount(_ account: Account) {
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
    
    func getConfigFromAccount(_ account: Account) -> [String: Any] {
        guard let config = account.config else { return getDefaultConfig() }
        
        return [
            "all": config.all,
            "recipe": config.recipe,
            "charm": config.charm,
            "pieceGear": config.pieceGear,
            "jewel": config.jewel,
            "rune": config.rune,
            "epicGear": config.epicGear,
            "magicScroll": config.magicScroll,
            "monsterScroll": config.monsterScroll,
            "staminaPotion": config.staminaPotion,
            "ancientPotion": config.ancientPotion,
            "itemList": config.itemList
        ]
    }
    
    // MARK: - Account Status
    
    func getAccountStatus(_ account: Account) -> String {
        return account.automationStatus
    }
    
    func getAccountStatusColor(_ account: Account) -> String {
        switch account.automationStatus {
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
    
    func isUsernameTaken(_ username: String, excluding account: Account? = nil) -> Bool {
        return accounts.contains { account in
            account.username.lowercased() == username.lowercased() && account != excluding
        }
    }
}
