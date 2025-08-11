import SwiftUI

struct ContentView: View {
    @StateObject private var accountViewModel = AccountViewModel()
    @StateObject private var automationService = WebKitAutomationService()
    @State private var selectedTab = 0
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Header
                headerView
                
                // Tab Selection
                tabSelectionView
                
                // Tab Content
                TabView(selection: $selectedTab) {
                    AccountListView(
                        accountViewModel: accountViewModel,
                        automationService: automationService
                    )
                    .tag(0)
                    
                    AutomationView(
                        automationService: automationService,
                        selectedAccount: accountViewModel.selectedAccount
                    )
                    .tag(1)
                    
                    SettingsView()
                        .tag(2)
                }
                .tabViewStyle(PageTabViewStyle(indexDisplayMode: .never))
            }
            .background(
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color(red: 0.04, green: 0.04, blue: 0.04),
                        Color(red: 0.10, green: 0.10, blue: 0.10)
                    ]),
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        }
        .navigationViewStyle(StackNavigationViewStyle())
    }
    
    private var headerView: some View {
        VStack(spacing: 8) {
            HStack {
                Image(systemName: "sword.fill")
                    .foregroundColor(.yellow)
                    .font(.title2)
                
                Text("⚔️ BDAutomator Account Manager ⚔️")
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(.yellow)
                
                Image(systemName: "shield.fill")
                    .foregroundColor(.yellow)
                    .font(.title2)
            }
            
            Rectangle()
                .fill(Color.yellow)
                .frame(width: 120, height: 2)
                .shadow(color: .yellow.opacity(0.6), radius: 4)
        }
        .padding(.vertical, 16)
        .background(Color.black.opacity(0.8))
    }
    
    private var tabSelectionView: some View {
        HStack(spacing: 0) {
            TabButton(
                title: "🏰 Accounts",
                isSelected: selectedTab == 0,
                action: { selectedTab = 0 }
            )
            
            TabButton(
                title: "🤖 Automation",
                isSelected: selectedTab == 1,
                action: { selectedTab = 1 }
            )
            
            TabButton(
                title: "⚙️ Settings",
                isSelected: selectedTab == 2,
                action: { selectedTab = 2 }
            )
        }
        .background(Color.black.opacity(0.6))
    }
}

struct TabButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(.body, design: .monospaced))
                .fontWeight(isSelected ? .bold : .medium)
                .foregroundColor(isSelected ? .black : .yellow)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity)
                .background(
                    Group {
                        if isSelected {
                            LinearGradient(
                                gradient: Gradient(colors: [.yellow, .orange]),
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        } else {
                            LinearGradient(
                                gradient: Gradient(colors: [
                                    Color(red: 0.10, green: 0.10, blue: 0.10),
                                    Color(red: 0.04, green: 0.04, blue: 0.04)
                                ]),
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        }
                    }
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 0)
                        .stroke(Color.yellow, lineWidth: 1)
                )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
