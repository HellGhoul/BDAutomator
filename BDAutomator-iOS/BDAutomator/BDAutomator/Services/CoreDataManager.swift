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
    
    func createAccount(username: String, password: String, config: [String: Any]) -> NSManagedObject {
        let account = NSEntityDescription.insertNewObject(forEntityName: "Account", into: context)
        account.setValue(username, forKey: "username")
        account.setValue(password, forKey: "password")
        account.setValue(UUID().uuidString, forKey: "id")
        account.setValue(true, forKey: "isActive")
        account.setValue(Date(), forKey: "lastLogin")
        account.setValue("stopped", forKey: "automationStatus")
        
        let accountConfig = NSEntityDescription.insertNewObject(forEntityName: "AccountConfig", into: context)
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
        
        account.setValue(accountConfig, forKey: "config")
        accountConfig.setValue(account, forKey: "account")
        
        save()
        return account
    }
    
    func fetchAccounts() -> [NSManagedObject] {
        let request = NSFetchRequest<NSManagedObject>(entityName: "Account")
        request.sortDescriptors = [NSSortDescriptor(key: "username", ascending: true)]
        
        do {
            return try context.fetch(request)
        } catch {
            print("Error fetching accounts: \(error)")
            return []
        }
    }
    
    func deleteAccount(_ account: NSManagedObject) {
        context.delete(account)
        save()
    }
    
    // MARK: - Log Operations
    
    func addLog(to account: NSManagedObject, message: String, type: String = "info") {
        let log = NSEntityDescription.insertNewObject(forEntityName: "AutomationLog", into: context)
        log.setValue(UUID().uuidString, forKey: "id")
        log.setValue(message, forKey: "message")
        log.setValue(type, forKey: "type")
        log.setValue(Date(), forKey: "timestamp")
        log.setValue(account, forKey: "account")
        
        save()
    }
    
    func fetchLogs(for account: NSManagedObject) -> [NSManagedObject] {
        let request = NSFetchRequest<NSManagedObject>(entityName: "AutomationLog")
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
