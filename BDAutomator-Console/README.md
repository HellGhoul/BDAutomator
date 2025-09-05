# BDAutomator Console

A lightweight, console-only version of BDAutomator designed for single account automation.

## Features

- 🎮 Simple console interface
- 🔐 Single account configuration
- ⚙️ Configurable automation settings
- 📊 Real-time log viewing
- 💾 Configuration persistence
- 🚀 Easy to use and deploy

## Installation

1. Navigate to the console app directory:
   ```bash
   cd BDAutomator-Console
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Make the app executable (optional):
   ```bash
   chmod +x console-app.js
   ```

## Usage

### Start the Console App
```bash
npm start
# or
node console-app.js
```

### Menu Options

1. **Configure Account** - Set your username and password
2. **Configure Automation Settings** - Set target levels, auto-hunt, auto-collect
3. **Start Automation** - Begin the automation process
4. **View Current Configuration** - Display current settings
5. **Exit** - Close the application

### Configuration

The app automatically saves your configuration to `config.json` in the same directory. You can also manually edit this file if needed.

Example `config.json`:
```json
{
  "username": "your_username",
  "password": "your_password",
  "config": {
    "targetLevel": null,
    "minLevel": 1,
    "maxLevel": 999,
    "autoHunt": true,
    "autoCollect": true
  }
}
```

## Requirements

- Node.js 16+ 
- Chrome browser installed
- Valid BlackDragon.mobi account

## Stopping Automation

Press `Ctrl+C` to stop the automation at any time.

## Troubleshooting

- Make sure Chrome is installed and accessible
- Complete any Cloudflare challenges when prompted
- Check that your account credentials are correct
- Ensure you have a stable internet connection

## Files

- `console-app.js` - Main console application
- `puppeteer-automation.js` - Core automation logic
- `blackdragon-helpers.js` - BlackDragon.mobi specific helpers
- `logger.js` - Logging utilities
- `config.json` - Your saved configuration (created automatically)
- `collectibles.txt` - Optional file for loot collection settings
