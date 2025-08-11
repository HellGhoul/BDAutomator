# 🚀 VS Code Setup for iOS Development

## **📋 Required VS Code Extensions**

Install these extensions in VS Code:

### **Essential Extensions**
1. **Swift Language Support** - `swift.swift-language`
2. **Swift Development Environment** - `vknabel.vscode-swift-development-environment`
3. **LLDB Debugger** - `vadimcn.vscode-lldb`
4. **JSON Support** - `ms-vscode.vscode-json`

### **Optional but Recommended**
- **Tailwind CSS** - `bradlc.vscode-tailwindcss`
- **Auto Rename Tag** - `formulahendry.auto-rename-tag`
- **HTML/CSS/JS Support** - Various Microsoft extensions

## **🔧 Installation Steps**

### **Step 1: Install Extensions**
1. Open VS Code
2. Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac)
3. Search and install each extension above
4. Reload VS Code

### **Step 2: Open Your Project**
```bash
cd /Users/macbookpro/Sources/BDAutomator-iOS
code .
```

### **Step 3: Verify Setup**
- Swift files should have syntax highlighting
- IntelliSense should work for Swift code
- Build tasks should be available

## **⚡ Using VS Code for iOS Development**

### **Build Commands**
Press `Ctrl+Shift+P` (or `Cmd+Shift+P`) and run:

- **Build iOS App**: `Tasks: Run Task` → `Build iOS App`
- **Clean Build**: `Tasks: Run Task` → `Clean Build`
- **Build for Device**: `Tasks: Run Task` → `Build for Device`

### **Keyboard Shortcuts**
- `Ctrl+Shift+P` - Command Palette
- `Ctrl+Shift+B` - Build (runs default build task)
- `F5` - Start Debugging
- `Ctrl+F5` - Run Without Debugging

### **Debugging**
1. Set breakpoints in Swift files
2. Press `F5` to start debugging
3. Use LLDB debugger for iOS apps

## **🛠️ Available Tasks**

### **Build Tasks**
- **Build iOS App**: Builds for iOS Simulator
- **Build for Device**: Builds for physical device
- **Clean Build**: Removes build artifacts
- **Run Swift Package**: Runs Swift Package Manager

### **Debug Configurations**
- **Debug iOS App**: Builds and debugs the app
- **Attach to iOS App**: Attaches debugger to running app

## **📱 Building Your App**

### **Method 1: VS Code Tasks**
1. Press `Ctrl+Shift+P`
2. Type "Tasks: Run Task"
3. Select "Build iOS App"
4. Watch the build output

### **Method 2: Terminal Integration**
1. Open integrated terminal (`Ctrl+`` `)
2. Run build commands manually:
```bash
xcodebuild -project BDAutomator.xcodeproj -scheme BDAutomator -destination 'platform=iOS Simulator,name=iPhone 15,OS=latest' build
```

### **Method 3: Swift Package Manager**
```bash
swift build
swift run
```

## **🔍 Troubleshooting**

### **Common Issues**

1. **"xcodebuild not found"**
   - Install Xcode Command Line Tools: `xcode-select --install`

2. **"Swift not found"**
   - Verify Swift installation: `swift --version`
   - Install Swift from swift.org if needed

3. **Build errors**
   - Check iOS deployment target compatibility
   - Verify all source files are included
   - Check Core Data model compatibility

### **Extension Issues**

1. **Swift Language Support not working**
   - Reload VS Code after installation
   - Check Swift path in settings
   - Verify file associations

2. **LLDB Debugger issues**
   - Ensure Xcode Command Line Tools are installed
   - Check debug configuration paths

## **🎯 Next Steps**

1. **Install all required extensions**
2. **Open your project in VS Code**
3. **Try building with VS Code tasks**
4. **Set breakpoints and debug**
5. **Test on iOS Simulator or device**

## **💡 Pro Tips**

- **Use integrated terminal** for command line operations
- **Set up keyboard shortcuts** for common tasks
- **Use VS Code's Git integration** for version control
- **Enable auto-save** for better development experience
- **Use split views** to see multiple files simultaneously

## **🚨 Important Notes**

- **VS Code cannot replace Xcode completely** for iOS development
- **Some iOS-specific features** require Xcode
- **App Store submission** still requires Xcode
- **Simulator testing** works with VS Code + command line tools

---

**🎉 Your VS Code is now ready for iOS development! 🚀**
