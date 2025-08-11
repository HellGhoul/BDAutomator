import Foundation
import CoreData

@objc(Account)
public class Account: NSManagedObject {
    @NSManaged public var id: String
    @NSManaged public var username: String
    @NSManaged public var password: String
    @NSManaged public var isActive: Bool
    @NSManaged public var lastLogin: Date?
    @NSManaged public var config: AccountConfig
    @NSManaged public var automationStatus: String
    @NSManaged public var logs: Set<AutomationLog>
    
    public override func awakeFromInsert() {
        super.awakeFromInsert()
        id = UUID().uuidString
        isActive = true
        automationStatus = "stopped"
        lastLogin = Date()
    }
}

@objc(AccountConfig)
public class AccountConfig: NSManagedObject {
    @NSManaged public var all: Bool
    @NSManaged public var recipe: Bool
    @NSManaged public var charm: Bool
    @NSManaged public var pieceGear: Bool
    @NSManaged public var jewel: Bool
    @NSManaged public var rune: Bool
    @NSManaged public var epicGear: Bool
    @NSManaged public var magicScroll: Bool
    @NSManaged public var monsterScroll: Bool
    @NSManaged public var staminaPotion: Bool
    @NSManaged public var ancientPotion: Bool
    @NSManaged public var itemList: String
    @NSManaged public var account: Account
}

@objc(AutomationLog)
public class AutomationLog: NSManagedObject {
    @NSManaged public var id: String
    @NSManaged public var message: String
    @NSManaged public var timestamp: Date
    @NSManaged public var type: String
    @NSManaged public var account: Account
    
    public override func awakeFromInsert() {
        super.awakeFromInsert()
        id = UUID().uuidString
        timestamp = Date()
    }
}
