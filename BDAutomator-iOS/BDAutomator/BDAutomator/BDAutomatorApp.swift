import SwiftUI

@main
struct BDAutomatorApp: App {
    let persistenceController = CoreDataManager.shared
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.managedObjectContext, persistenceController.context)
        }
    }
}
