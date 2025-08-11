import Foundation
import CoreData

class CoreDataManager {
    static let shared = CoreDataManager()
    
    private init() {}
    
    lazy var persistentContainer: NSPersistentContainer = {
        let container = NSPersistentContainer(name: "BDAutomator")
        container.loadPersistentStores { _, error in
            if let error = error {
                fatalError("Core Data error: \(error)")
            }
        }
        return container
    }()
    
    var context: NSManagedObjectContext {
        return persistentContainer.viewContext
    }
    
    func save() {
        if context.hasChanges {
            do {
                try context.save()
            } catch {
                print("Error saving context: \(error)")
            }
        }
    }
    
    // MARK: - Account Operations
    
    func createAccount(username: String, password: String, config: [String: Any]) -> Account {
        let account = Account(context: context)
        account.username = username
        account.password = password
        
        let accountConfig = AccountConfig(context: context)
        accountConfig.all = config["all"] as? Bool ?? false
        accountConfig.recipe = config["recipe"] as? Bool ?? false
        accountConfig.charm = config["charm"] as? Bool ?? false
        accountConfig.pieceGear = config["pieceGear"] as? Bool ?? false
        accountConfig.jewel = config["jewel"] as? Bool ?? false
        accountConfig.rune = config["rune"] as? Bool ?? false
        accountConfig.epicGear = config["epicGear"] as? Bool ?? false
        accountConfig.magicScroll = config["magicScroll"] as? Bool ?? false
        accountConfig.monsterScroll = config["monsterScroll"] as? Bool ?? false
        accountConfig.staminaPotion = config["staminaPotion"] as? Bool ?? false
        accountConfig.ancientPotion = config["ancientPotion"] as? Bool ?? false
        accountConfig.itemList = config["itemList"] as? String ?? ""
        
        account.config = accountConfig
        accountConfig.account = account
        
        save()
        return account
    }
    
    func fetchAccounts() -> [Account] {
        let request: NSFetchRequest<Account> = Account.fetchRequest()
        request.sortDescriptors = [NSSortDescriptor(key: "username", ascending: true)]
        
        do {
            return try context.fetch(request)
        } catch {
            print("Error fetching accounts: \(error)")
            return []
        }
    }
    
    func deleteAccount(_ account: Account) {
        context.delete(account)
        save()
    }
    
    // MARK: - Log Operations
    
    func addLog(to account: Account, message: String, type: String = "info") {
        let log = AutomationLog(context: context)
        log.message = message
        log.type = type
        log.account = account
        
        save()
    }
    
    func fetchLogs(for account: Account) -> [AutomationLog] {
        let request: NSFetchRequest<AutomationLog> = AutomationLog.fetchRequest()
        request.predicate = NSPredicate(format: "account == %@", account)
        request.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: false)]
        request.fetchLimit = 100
        
        do {
            return try context.fetch(request)
        } catch {
            print("Error fetching logs: \(error)")
            return []
        }
    }
}
