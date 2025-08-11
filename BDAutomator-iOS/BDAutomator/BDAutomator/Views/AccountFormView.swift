import SwiftUI

enum AccountFormMode {
    case add
    case edit(Account)
}

struct AccountFormView: View {
    @ObservedObject var accountViewModel: AccountViewModel
    let mode: AccountFormMode
    
    @Environment(\.dismiss) private var dismiss
    
    @State private var username = ""
    @State private var password = ""
    @State private var config: [String: Any] = [:]
    @State private var showingValidationAlert = false
    @State private var validationMessage = ""
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    // Header
                    headerView
                    
                    // Form Fields
                    formFields
                    
                    // Configuration Options
                    configurationSection
                    
                    // Action Buttons
                    actionButtons
                }
                .padding(20)
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
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(.yellow)
                }
            }
        }
        .onAppear {
            setupForm()
        }
        .alert("Validation Error", isPresented: $showingValidationAlert) {
            Button("OK") { }
        } message: {
            Text(validationMessage)
        }
    }
    
    private var headerView: some View {
        VStack(spacing: 8) {
            Image(systemName: mode == .add ? "person.badge.plus" : "person.badge.gear")
                .font(.largeTitle)
                .foregroundColor(.yellow)
            
            Text(mode == .add ? "Add New Warrior" : "Edit Warrior")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(.yellow)
        }
    }
    
    private var formFields: some View {
        VStack(spacing: 16) {
            // Username Field
            VStack(alignment: .leading, spacing: 8) {
                Text("👤 Username")
                    .font(.headline)
                    .foregroundColor(.yellow)
                
                TextField("Enter username", text: $username)
                    .textFieldStyle(RPGTextFieldStyle())
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
            }
            
            // Password Field
            VStack(alignment: .leading, spacing: 8) {
                Text("🔒 Password")
                    .font(.headline)
                    .foregroundColor(.yellow)
                
                SecureField("Enter password", text: $password)
                    .textFieldStyle(RPGTextFieldStyle())
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
            }
        }
    }
    
    private var configurationSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("⚔️ Battle Configuration")
                .font(.title3)
                .fontWeight(.bold)
                .foregroundColor(.yellow)
            
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 2), spacing: 12) {
                ConfigToggleView(title: "All Items", isOn: binding(for: "all"))
                ConfigToggleView(title: "Recipe", isOn: binding(for: "recipe"))
                ConfigToggleView(title: "Charm", isOn: binding(for: "charm"))
                ConfigToggleView(title: "Piece Gear", isOn: binding(for: "pieceGear"))
                ConfigToggleView(title: "Jewel", isOn: binding(for: "jewel"))
                ConfigToggleView(title: "Rune", isOn: binding(for: "rune"))
                ConfigToggleView(title: "Epic Gear", isOn: binding(for: "epicGear"))
                ConfigToggleView(title: "Magic Scroll", isOn: binding(for: "magicScroll"))
                ConfigToggleView(title: "Monster Scroll", isOn: binding(for: "monsterScroll"))
                ConfigToggleView(title: "Stamina Potion", isOn: binding(for: "staminaPotion"))
                ConfigToggleView(title: "Ancient Potion", isOn: binding(for: "ancientPotion"))
            }
            
            // Custom Item List
            VStack(alignment: .leading, spacing: 8) {
                Text("📝 Custom Item List")
                    .font(.headline)
                    .foregroundColor(.yellow)
                
                TextField("Enter custom items (comma separated)", text: binding(for: "itemList"))
                    .textFieldStyle(RPGTextFieldStyle())
            }
        }
    }
    
    private var actionButtons: some View {
        VStack(spacing: 12) {
            Button(action: saveAccount) {
                HStack {
                    Image(systemName: mode == .add ? "plus.circle.fill" : "checkmark.circle.fill")
                    Text(mode == .add ? "Add Warrior" : "Update Warrior")
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
            
            if mode == .edit {
                Button(action: { dismiss() }) {
                    Text("Cancel")
                        .fontWeight(.medium)
                        .foregroundColor(.yellow)
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(Color.clear)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.yellow, lineWidth: 1)
                        )
                }
            }
        }
    }
    
    // MARK: - Helper Methods
    
    private func setupForm() {
        switch mode {
        case .add:
            config = accountViewModel.getDefaultConfig()
        case .edit(let account):
            username = account.username
            password = account.password
            config = accountViewModel.getConfigFromAccount(account)
        }
    }
    
    private func binding(for key: String) -> Binding<String> {
        Binding(
            get: { config[key] as? String ?? "" },
            set: { config[key] = $0 }
        )
    }
    
    private func binding(for key: String) -> Binding<Bool> {
        Binding(
            get: { config[key] as? Bool ?? false },
            set: { config[key] = $0 }
        )
    }
    
    private func saveAccount() {
        // Validation
        guard accountViewModel.validateAccount(username: username, password: password) else {
            validationMessage = "Username and password are required"
            showingValidationAlert = true
            return
        }
        
        if case .add = mode {
            if accountViewModel.isUsernameTaken(username) {
                validationMessage = "Username already exists"
                showingValidationAlert = true
                return
            }
        }
        
        // Save account
        switch mode {
        case .add:
            accountViewModel.addAccount(username: username, password: password, config: config)
        case .edit(let account):
            accountViewModel.updateAccount(account, username: username, password: password, config: config)
        }
        
        dismiss()
    }
}

struct ConfigToggleView: View {
    let title: String
    @Binding var isOn: Bool
    
    var body: some View {
        HStack {
            Toggle("", isOn: $isOn)
                .toggleStyle(RPGToggleStyle())
            
            Text(title)
                .font(.caption)
                .foregroundColor(.yellow)
            
            Spacer()
        }
    }
}

struct RPGTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label, Self._Placeholder, Self._Text>) -> some View {
        configuration
            .padding()
            .background(Color.black.opacity(0.6))
            .foregroundColor(.yellow)
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.yellow, lineWidth: 1)
            )
    }
}

struct RPGToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack {
            configuration.label
            Spacer()
            Rectangle()
                .fill(configuration.isOn ? Color.yellow : Color.gray)
                .frame(width: 40, height: 24)
                .cornerRadius(12)
                .overlay(
                    Circle()
                        .fill(Color.white)
                        .frame(width: 20, height: 20)
                        .offset(x: configuration.isOn ? 8 : -8)
                        .animation(.easeInOut(duration: 0.2), value: configuration.isOn)
                )
                .onTapGesture {
                    configuration.isOn.toggle()
                }
        }
    }
}

struct AccountFormView_Previews: PreviewProvider {
    static var previews: some View {
        AccountFormView(
            accountViewModel: AccountViewModel(),
            mode: .add
        )
        .preferredColorScheme(.dark)
    }
}
