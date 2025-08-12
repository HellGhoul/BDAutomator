import SwiftUI
import WebKit

struct AutomationView: View {
    @ObservedObject var automationService: WebKitAutomationService
    let selectedAccount: NSManagedObject?
    
    @State private var webView: WKWebView?
    @State private var showingWebView = false
    
    var body: some View {
        VStack(spacing: 20) {
            // Header
            headerView
            
            // Account Selection
            accountSelectionView
            
            // Automation Controls
            automationControlsView
            
            // Status and Logs
            statusAndLogsView
            
            Spacer()
        }
        .padding(20)
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
        .sheet(isPresented: $showingWebView) {
            WebViewContainer(webView: webView ?? automationService.setupWebView())
        }
        .onAppear {
            setupWebView()
        }
    }
    
    private var headerView: some View {
        VStack(spacing: 8) {
            Image(systemName: "robot")
                .font(.largeTitle)
                .foregroundColor(.yellow)
            
            Text("🤖 Automation Control")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(.yellow)
        }
    }
    
    private var accountSelectionView: some View {
        VStack(spacing: 12) {
            if let account = selectedAccount {
                HStack {
                    Image(systemName: "person.circle.fill")
                        .foregroundColor(.green)
                        .font(.title2)
                    
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Selected Warrior")
                            .font(.caption)
                            .foregroundColor(.gray)
                        
                        Text(account.value(forKey: "username") as? String ?? "Unknown")
                            .font(.headline)
                            .foregroundColor(.yellow)
                    }
                    
                    Spacer()
                    
                    Circle()
                        .fill(statusColor)
                        .frame(width: 12, height: 12)
                        .overlay(
                            Circle()
                                .stroke(Color.yellow, lineWidth: 1)
                        )
                }
                .padding()
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.black.opacity(0.6))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.green, lineWidth: 1)
                        )
                )
            } else {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.orange)
                        .font(.title2)
                    
                    Text("No warrior selected. Go to Accounts tab to select one.")
                        .font(.body)
                        .foregroundColor(.orange)
                        .multilineTextAlignment(.leading)
                    
                    Spacer()
                }
                .padding()
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.black.opacity(0.6))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.orange, lineWidth: 1)
                        )
                )
            }
        }
    }
    
    private var automationControlsView: some View {
        VStack(spacing: 16) {
            Text("⚔️ Battle Controls")
                .font(.headline)
                .foregroundColor(.yellow)
            
            HStack(spacing: 16) {
                // Start Button
                Button(action: startAutomation) {
                    HStack {
                        Image(systemName: "play.fill")
                        Text("Start")
                            .fontWeight(.semibold)
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
                    .cornerRadius(12)
                    .shadow(color: .green.opacity(0.3), radius: 4)
                }
                .disabled(selectedAccount == nil || automationService.isRunning)
                
                // Stop Button
                Button(action: stopAutomation) {
                    HStack {
                        Image(systemName: "stop.fill")
                        Text("Stop")
                            .fontWeight(.semibold)
                    }
                    .foregroundColor(.white)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(
                        LinearGradient(
                            gradient: Gradient(colors: [.red, .orange]),
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .cornerRadius(12)
                    .shadow(color: .red.opacity(0.3), radius: 4)
                }
                .disabled(!automationService.isRunning)
            }
            
            HStack(spacing: 16) {
                // Pause Button
                Button(action: pauseAutomation) {
                    HStack {
                        Image(systemName: "pause.fill")
                        Text("Pause")
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
                .disabled(!automationService.isRunning)
                
                // Resume Button
                Button(action: resumeAutomation) {
                    HStack {
                        Image(systemName: "play.fill")
                        Text("Resume")
                            .fontWeight(.semibold)
                    }
                    .foregroundColor(.black)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(
                        LinearGradient(
                            gradient: Gradient(colors: [.blue, .green]),
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .cornerRadius(12)
                    .shadow(color: .blue.opacity(0.3), radius: 4)
                }
                .disabled(automationService.isRunning)
            }
            
            // WebView Button
            Button(action: { showingWebView = true }) {
                HStack {
                    Image(systemName: "globe")
                    Text("Open Game View")
                        .fontWeight(.semibold)
                }
                .foregroundColor(.black)
                .padding()
                .frame(maxWidth: .infinity)
                .background(
                    LinearGradient(
                        gradient: Gradient(colors: [.purple, .blue]),
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .cornerRadius(12)
                .shadow(color: .purple.opacity(0.3), radius: 4)
            }
        }
    }
    
    private var statusAndLogsView: some View {
        VStack(spacing: 16) {
            // Status
            HStack {
                Text("Status:")
                    .font(.headline)
                    .foregroundColor(.yellow)
                
                Spacer()
                
                Text(automationService.currentStatus)
                    .font(.body)
                    .foregroundColor(statusTextColor)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(statusBackgroundColor)
                    )
            }
            
            // Logs
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("📋 Automation Logs")
                        .font(.headline)
                        .foregroundColor(.yellow)
                    
                    Spacer()
                    
                    Button(action: clearLogs) {
                        Text("Clear")
                            .font(.caption)
                            .foregroundColor(.red)
                    }
                }
                
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(automationService.logs, id: \.self) { log in
                            LogEntryView(log: log)
                        }
                    }
                }
                .frame(maxHeight: 200)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.black.opacity(0.8))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.yellow, lineWidth: 1)
                        )
                )
            }
        }
    }
    
    // MARK: - Helper Methods
    
    private func setupWebView() {
        webView = automationService.setupWebView()
    }
    
    private func startAutomation() {
        guard let account = selectedAccount else { return }
        automationService.startAutomation(for: account)
    }
    
    private func stopAutomation() {
        automationService.stopAutomation()
    }
    
    private func pauseAutomation() {
        automationService.pauseAutomation()
    }
    
    private func resumeAutomation() {
        automationService.resumeAutomation()
    }
    
    private func clearLogs() {
        // This would need to be implemented in the service
        // For now, we'll just clear the published logs
        automationService.logs.removeAll()
    }
    
    private var statusColor: Color {
        if automationService.isRunning {
            return .green
        } else {
            return .red
        }
    }
    
    private var statusTextColor: Color {
        if automationService.isRunning {
            return .black
        } else {
            return .white
        }
    }
    
    private var statusBackgroundColor: Color {
        if automationService.isRunning {
            return .green
        } else {
            return .red
        }
    }
}

struct LogEntryView: View {
    let log: String
    
    var body: some View {
        HStack {
            Text(log)
                .font(.caption)
                .foregroundColor(.green)
                .fontFamily(.monospaced)
            
            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
    }
}

struct WebViewContainer: View {
    let webView: WKWebView
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            WebViewRepresentable(webView: webView)
                .navigationTitle("Game View")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Done") {
                            dismiss()
                        }
                        .foregroundColor(.yellow)
                    }
                }
        }
    }
}

#if os(iOS)
struct WebViewRepresentable: UIViewRepresentable {
    let webView: WKWebView
    
    func makeUIView(context: Context) -> WKWebView {
        return webView
    }
    
    func updateUIView(_ uiView: WKWebView, context: Context) {
        // No updates needed
    }
}
#elseif os(macOS)
struct WebViewRepresentable: NSViewRepresentable {
    let webView: WKWebView
    
    func makeNSView(context: Context) -> WKWebView {
        return webView
    }
    
    func updateNSView(_ nsView: WKWebView, context: Context) {
        // No updates needed
    }
}
#endif

struct AutomationView_Previews: PreviewProvider {
    static var previews: some View {
        AutomationView(
            automationService: WebKitAutomationService(),
            selectedAccount: nil
        )
    }
}
