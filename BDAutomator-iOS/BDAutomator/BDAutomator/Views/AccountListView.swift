import SwiftUI

struct AccountListView: View {
    @ObservedObject var accountViewModel: AccountViewModel
    @ObservedObject var automationService: WebKitAutomationService
    @State private var showingAddAccount = false
    @State private var showingEditAccount: NSManagedObject?
    
    var body: some View {
        VStack(spacing: 16) {
            // Account List
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(accountViewModel.accounts, id: \.self) { account in
                        AccountCard(
                            account: account,
                            accountViewModel: accountViewModel,
                            automationService: automationService,
                            onEdit: { showingEditAccount = account }
                        )
                    }
                }
                .padding(.horizontal, 16)
            }
            
            // Add Account Button
            Button(action: { showingAddAccount = true }) {
                HStack {
                    Image(systemName: "plus.circle.fill")
                    Text("➕ Add New Warrior")
                        .fontWeight(.semibold)
                }
                .foregroundColor(.black)
                .padding()
                .frame(maxWidth: .infinity)
                .background(
                    LinearGradient(
                        gradient: Gradient(colors: [.yellow, .orange]),
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .cornerRadius(12)
                .shadow(color: .yellow.opacity(0.3), radius: 4)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
        .sheet(isPresented: $showingAddAccount) {
            AccountFormView(
                accountViewModel: accountViewModel,
                mode: .add
            )
        }
        .sheet(item: $showingEditAccount) { account in
            AccountFormView(
                accountViewModel: accountViewModel,
                mode: .edit(account)
            )
        }
    }
}

struct AccountCard: View {
    let account: NSManagedObject
    @ObservedObject var accountViewModel: AccountViewModel
    @ObservedObject var automationService: WebKitAutomationService
    let onEdit: () -> Void
    
    var body: some View {
        VStack(spacing: 12) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(accountViewModel.getAccountUsername(account))
                        .font(.title3)
                        .fontWeight(.bold)
                        .foregroundColor(.yellow)
                    
                    Text("Last Login: \(accountViewModel.getAccountLastLogin(account)?.formatted() ?? "Never")")
                        .font(.caption)
                        .foregroundColor(.gray)
                }
                
                Spacer()
                
                // Status Indicator
                Circle()
                    .fill(statusColor)
                    .frame(width: 12, height: 12)
                    .overlay(
                        Circle()
                            .stroke(Color.yellow, lineWidth: 1)
                    )
            }
            
            // Configuration Summary
            if let config = account.value(forKey: "config") as? NSManagedObject {
                ConfigurationSummaryView(config: config)
            }
            
            // Action Buttons
            HStack(spacing: 12) {
                // Select Button
                Button(action: { accountViewModel.selectAccount(account) }) {
                    Text("Select")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.black)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color.yellow)
                        .cornerRadius(8)
                }
                
                // Edit Button
                Button(action: onEdit) {
                    Text("Edit")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.yellow)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color.clear)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.yellow, lineWidth: 1)
                        )
                }
                
                // Delete Button
                Button(action: { deleteAccount() }) {
                    Text("Delete")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.red)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color.clear)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.red, lineWidth: 1)
                        )
                }
                
                Spacer()
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.black.opacity(0.8))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.yellow, lineWidth: 1)
                )
        )
        .shadow(color: .yellow.opacity(0.2), radius: 4)
    }
    
    private var statusColor: Color {
        let status = accountViewModel.getAccountStatus(account)
        switch status {
        case "running":
            return .green
        case "paused":
            return .yellow
        case "stopped":
            return .red
        default:
            return .gray
        }
    }
    
    private func deleteAccount() {
        accountViewModel.deleteAccount(account)
    }
}

struct ConfigurationSummaryView: View {
    let config: NSManagedObject
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Configuration:")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(.yellow)
            
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 3), spacing: 4) {
                ConfigItemView(name: "Recipe", isEnabled: config.value(forKey: "recipe") as? Bool ?? false)
                ConfigItemView(name: "Charm", isEnabled: config.value(forKey: "charm") as? Bool ?? false)
                ConfigItemView(name: "Gear", isEnabled: config.value(forKey: "pieceGear") as? Bool ?? false)
                ConfigItemView(name: "Jewel", isEnabled: config.value(forKey: "jewel") as? Bool ?? false)
                ConfigItemView(name: "Rune", isEnabled: config.value(forKey: "rune") as? Bool ?? false)
                ConfigItemView(name: "Epic", isEnabled: config.value(forKey: "epicGear") as? Bool ?? false)
                ConfigItemView(name: "Scroll", isEnabled: config.value(forKey: "magicScroll") as? Bool ?? false)
                ConfigItemView(name: "Monster", isEnabled: config.value(forKey: "monsterScroll") as? Bool ?? false)
                ConfigItemView(name: "Potion", isEnabled: config.value(forKey: "staminaPotion") as? Bool ?? false)
            }
        }
    }
}

struct ConfigItemView: View {
    let name: String
    let isEnabled: Bool
    
    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(isEnabled ? Color.green : Color.red)
                .frame(width: 6, height: 6)
            
            Text(name)
                .font(.caption2)
                .foregroundColor(isEnabled ? .green : .red)
        }
    }
}

struct AccountListView_Previews: PreviewProvider {
    static var previews: some View {
        AccountListView(
            accountViewModel: AccountViewModel(),
            automationService: WebKitAutomationService()
        )
        .preferredColorScheme(.dark)
    }
}
