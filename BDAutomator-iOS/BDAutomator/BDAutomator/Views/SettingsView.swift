import SwiftUI

struct SettingsView: View {
    @AppStorage("autoStartAutomation") private var autoStartAutomation = false
    @AppStorage("autoLoginEnabled") private var autoLoginEnabled = true
    @AppStorage("logRetentionDays") private var logRetentionDays = 30
    @AppStorage("notificationEnabled") private var notificationEnabled = true
    @AppStorage("darkModeEnabled") private var darkModeEnabled = true
    
    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                headerView
                
                // General Settings
                generalSettingsSection
                
                // Automation Settings
                automationSettingsSection
                
                // Notification Settings
                notificationSettingsSection
                
                // About Section
                aboutSection
                
                Spacer()
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
    }
    
    private var headerView: some View {
        VStack(spacing: 8) {
            Image(systemName: "gearshape.fill")
                .font(.largeTitle)
                .foregroundColor(.yellow)
            
            Text("⚙️ Settings")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(.yellow)
        }
    }
    
    private var generalSettingsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("🔧 General")
                .font(.headline)
                .foregroundColor(.yellow)
            
            VStack(spacing: 12) {
                SettingToggleRow(
                    title: "Dark Mode",
                    subtitle: "Use dark theme for the app",
                    isOn: $darkModeEnabled,
                    icon: "moon.fill"
                )
                
                SettingToggleRow(
                    title: "Auto Login",
                    subtitle: "Automatically log in to accounts",
                    isOn: $autoLoginEnabled,
                    icon: "key.fill"
                )
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.black.opacity(0.6))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.yellow, lineWidth: 1)
                )
        )
    }
    
    private var automationSettingsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("🤖 Automation")
                .font(.headline)
                .foregroundColor(.yellow)
            
            VStack(spacing: 12) {
                SettingToggleRow(
                    title: "Auto Start",
                    subtitle: "Automatically start automation when app launches",
                    isOn: $autoStartAutomation,
                    icon: "play.circle.fill"
                )
                
                SettingSliderRow(
                    title: "Log Retention",
                    subtitle: "Keep logs for \(logRetentionDays) days",
                    value: $logRetentionDays,
                    range: 7...90,
                    step: 1,
                    icon: "clock.fill"
                )
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.black.opacity(0.6))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.yellow, lineWidth: 1)
                )
        )
    }
    
    private var notificationSettingsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("🔔 Notifications")
                .font(.headline)
                .foregroundColor(.yellow)
            
            VStack(spacing: 12) {
                SettingToggleRow(
                    title: "Enable Notifications",
                    subtitle: "Receive alerts for automation events",
                    isOn: $notificationEnabled,
                    icon: "bell.fill"
                )
                
                if notificationEnabled {
                    NotificationTypesView()
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.black.opacity(0.6))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.yellow, lineWidth: 1)
                )
        )
    }
    
    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("ℹ️ About")
                .font(.headline)
                .foregroundColor(.yellow)
            
            VStack(spacing: 12) {
                AboutRow(
                    title: "Version",
                    value: "1.0.0",
                    icon: "info.circle.fill"
                )
                
                AboutRow(
                    title: "Build",
                    value: "2024.1",
                    icon: "hammer.fill"
                )
                
                AboutRow(
                    title: "Developer",
                    value: "BDAutomator Team",
                    icon: "person.2.fill"
                )
                
                Button(action: exportData) {
                    HStack {
                        Image(systemName: "square.and.arrow.up")
                        Text("Export Data")
                            .fontWeight(.medium)
                    }
                    .foregroundColor(.black)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(
                        LinearGradient(
                            gradient: Gradient(colors: [.blue, .purple]),
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .cornerRadius(8)
                }
                
                Button(action: importData) {
                    HStack {
                        Image(systemName: "square.and.arrow.down")
                        Text("Import Data")
                            .fontWeight(.medium)
                    }
                    .foregroundColor(.black)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(
                        LinearGradient(
                            gradient: Gradient(colors: [.green, .blue]),
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .cornerRadius(8)
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.black.opacity(0.6))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.yellow, lineWidth: 1)
                )
        )
    }
    
    // MARK: - Actions
    
    private func exportData() {
        // Implement data export functionality
        print("Export data tapped")
    }
    
    private func importData() {
        // Implement data import functionality
        print("Import data tapped")
    }
}

struct SettingToggleRow: View {
    let title: String
    let subtitle: String
    @Binding var isOn: Bool
    let icon: String
    
    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(.yellow)
                .font(.title3)
                .frame(width: 24)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body)
                    .fontWeight(.medium)
                    .foregroundColor(.yellow)
                
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            Spacer()
            
            Toggle("", isOn: $isOn)
                .toggleStyle(RPGToggleStyle())
        }
    }
}

struct SettingSliderRow: View {
    let title: String
    let subtitle: String
    @Binding var value: Int
    let range: ClosedRange<Int>
    let step: Int
    let icon: String
    
    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(.yellow)
                .font(.title3)
                .frame(width: 24)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body)
                    .fontWeight(.medium)
                    .foregroundColor(.yellow)
                
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            
            Spacer()
            
            Slider(value: Binding(
                get: { Double(value) },
                set: { value = Int($0) }
            ), in: Double(range.lowerBound)...Double(range.upperBound), step: Double(step))
            .accentColor(.yellow)
            .frame(width: 100)
        }
    }
}

struct AboutRow: View {
    let title: String
    let value: String
    let icon: String
    
    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(.yellow)
                .font(.title3)
                .frame(width: 24)
            
            Text(title)
                .font(.body)
                .foregroundColor(.yellow)
            
            Spacer()
            
            Text(value)
                .font(.body)
                .foregroundColor(.gray)
        }
    }
}

struct NotificationTypesView: View {
    @AppStorage("notifyOnStart") private var notifyOnStart = true
    @AppStorage("notifyOnStop") private var notifyOnStop = true
    @AppStorage("notifyOnError") private var notifyOnError = true
    @AppStorage("notifyOnLoot") private var notifyOnLoot = true
    
    var body: some View {
        VStack(spacing: 8) {
            SettingToggleRow(
                title: "On Start",
                subtitle: "When automation begins",
                isOn: $notifyOnStart,
                icon: "play.fill"
            )
            
            SettingToggleRow(
                title: "On Stop",
                subtitle: "When automation ends",
                isOn: $notifyOnStop,
                icon: "stop.fill"
            )
            
            SettingToggleRow(
                title: "On Error",
                subtitle: "When errors occur",
                isOn: $notifyOnError,
                icon: "exclamationmark.triangle.fill"
            )
            
            SettingToggleRow(
                title: "On Loot",
                subtitle: "When items are found",
                isOn: $notifyOnLoot,
                icon: "gift.fill"
            )
        }
        .padding(.leading, 20)
    }
}

struct SettingsView_Previews: PreviewProvider {
    static var previews: some View {
        SettingsView()
            .preferredColorScheme(.dark)
    }
}
