# 🚀 BDAutomator iOS

A native iOS clone of the BDAutomator desktop application, built with SwiftUI and WebKit for Black Dragon game automation.

## ✨ Features

- **🏰 Account Management**: Store and manage multiple game accounts with secure credentials
- **🤖 WebKit Automation**: In-app web automation using WKWebView instead of Puppeteer
- **⚔️ Game Automation**: Automate battles, item collection, and game progression
- **📊 Real-time Monitoring**: Live automation logs and status updates
- **💾 Core Data Storage**: Persistent storage for accounts, configurations, and logs
- **🎨 RPG-themed UI**: Beautiful dark theme with gold accents matching the original app
- **⚙️ Settings & Configuration**: Customizable automation preferences and app settings

## 🛠️ Technical Stack

- **Frontend**: SwiftUI (iOS 15.0+)
- **Backend**: Core Data, WebKit, Combine
- **Architecture**: MVVM with ObservableObject pattern
- **Storage**: Core Data with SQLite backend
- **Automation**: WKWebView with JavaScript injection

## 📱 Requirements

- **iOS Version**: 15.0 or later
- **Device**: iPhone or iPad
- **Xcode**: 14.0 or later (for development)
- **macOS**: 12.0 or later (for development)

## 🚀 How to Launch the App

### Option 1: Using Xcode (Recommended for Development)

1. **Open Xcode**
   ```bash
   open BDAutomator.xcodeproj
   ```

2. **Select Target Device**
   - Choose your connected iPhone/iPad, or
   - Use iOS Simulator for testing

3. **Build and Run**
   - Press `⌘ + R` or click the ▶️ button
   - Wait for the build to complete
   - App will launch automatically

### Option 2: Command Line Build

1. **Navigate to project directory**
   ```bash
   cd BDAutomator-iOS
   ```

2. **Build for simulator**
   ```bash
   xcodebuild -project BDAutomator.xcodeproj -scheme BDAutomator -destination 'platform=iOS Simulator,name=iPhone 15,OS=latest' build
   ```

3. **Build for device** (requires valid provisioning profile)
   ```bash
   xcodebuild -project BDAutomator.xcodeproj -scheme BDAutomator -destination 'platform=iOS,id=YOUR_DEVICE_ID' build
   ```

### Option 3: Archive and Install

1. **Archive the app**
   ```bash
   xcodebuild -project BDAutomator.xcodeproj -scheme BDAutomator archive -archivePath BDAutomator.xcarchive
   ```

2. **Export IPA**
   ```bash
   xcodebuild -exportArchive -archivePath BDAutomator.xcarchive -exportPath ./build -exportOptionsPlist exportOptions.plist
   ```

3. **Install via Xcode or TestFlight**

## 🔧 Project Structure

```
BDAutomator-iOS/
├── BDAutomator.xcodeproj/          # Xcode project file
├── BDAutomator/
│   ├── BDAutomatorApp.swift        # App entry point
│   ├── Models/                     # Core Data models
│   │   └── Account.swift
│   ├── Views/                      # SwiftUI views
│   │   ├── ContentView.swift       # Main tab view
│   │   ├── AccountListView.swift   # Account management
│   │   ├── AccountFormView.swift   # Add/edit accounts
│   │   ├── AutomationView.swift    # Automation controls
│   │   └── SettingsView.swift      # App settings
│   ├── ViewModels/                 # MVVM view models
│   │   └── AccountViewModel.swift
│   ├── Services/                   # Business logic
│   │   ├── CoreDataManager.swift   # Database operations
│   │   └── WebKitAutomationService.swift # Web automation
│   ├── Resources/                  # App resources
│   │   └── collectibles.txt        # Game items list
│   └── BDAutomator.xcdatamodeld/  # Core Data schema
│       └── BDAutomator.xcdatamodel/
│           └── contents
└── README.md                       # This file
```

## 🎯 Key Components

### Core Data Models
- **Account**: Stores user credentials and automation status
- **AccountConfig**: Battle configuration preferences
- **AutomationLog**: Automation activity logs

### WebKit Automation Service
- Replaces Puppeteer functionality
- JavaScript injection for game interaction
- Real-time status monitoring
- Background automation loop

### SwiftUI Views
- **ContentView**: Main tab-based navigation
- **AccountListView**: Account management interface
- **AutomationView**: Automation controls and monitoring
- **SettingsView**: App configuration

## 🔐 Security Features

- **Secure Storage**: Core Data with iOS keychain integration
- **Credential Protection**: Encrypted password storage
- **App Sandboxing**: iOS security model compliance
- **Network Security**: HTTPS enforcement for game connections

## 🚨 Important Notes

### iOS Limitations
- **Background Automation**: Limited compared to desktop (Puppeteer)
- **WebKit Restrictions**: Some web automation features may be restricted
- **App Store Review**: Automation apps require careful review process

### Recommendations
- **Test Thoroughly**: Verify automation works on target devices
- **User Education**: Explain automation limitations to users
- **Compliance**: Ensure app follows iOS App Store guidelines

## 🐛 Troubleshooting

### Common Issues

1. **Build Errors**
   - Ensure Xcode version compatibility
   - Check iOS deployment target
   - Verify all files are included in project

2. **Runtime Crashes**
   - Check Core Data model compatibility
   - Verify WebKit permissions
   - Review console logs for errors

3. **Automation Issues**
   - Check network connectivity
   - Verify game website accessibility
   - Review JavaScript injection logs

### Debug Mode
- Enable console logging in Xcode
- Use iOS Simulator for testing
- Check device logs via Xcode Organizer

## 📱 App Store Deployment

### Prerequisites
- Apple Developer Account ($99/year)
- Valid provisioning profiles
- App Store Connect setup
- Privacy policy and terms of service

### Review Process
- **Automation Apps**: May require additional review
- **Web Content**: Ensure compliance with App Store guidelines
- **User Data**: Implement proper data handling policies

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes and test thoroughly
4. Submit pull request with detailed description

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:
- Check troubleshooting section above
- Review iOS development documentation
- Consult Apple Developer forums
- Open GitHub issue with detailed description

---

**⚔️ Ready to automate your Black Dragon adventures on iOS! 🚀**
