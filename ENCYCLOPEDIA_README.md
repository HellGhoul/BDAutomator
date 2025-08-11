# 📚 Encyclopedia Feature - BDAutomator

## Overview

The Encyclopedia feature is a powerful addition to BDAutomator that allows you to crawl and collect comprehensive game data from the Browser Defender game library. This data is stored locally in a SQLite database and can be used for various purposes such as:

- **Game Research**: Study item stats, monster abilities, and quest requirements
- **Strategy Planning**: Analyze drop rates, skill cooldowns, and level requirements
- **Data Analysis**: Export data for external analysis or personal databases
- **Reference Material**: Create your own game guide or wiki

## 🚀 Features

### Data Collection
- **Items**: Equipment, consumables, materials with stats and rarity
- **Monsters**: Enemy information including HP, attack, defense, and drops
- **Skills**: Ability details with cooldowns, effects, and requirements
- **Quests**: Mission objectives, rewards, and level requirements

### Smart Crawling
- **Automated Login**: Uses your account credentials to access the game
- **Intelligent Parsing**: Automatically detects and extracts data from various page layouts
- **Session Management**: Tracks crawling progress and statistics
- **Error Handling**: Gracefully handles network issues and page changes

### User Interface
- **Real-time Statistics**: View counts of collected data
- **Search Functionality**: Find specific items, monsters, skills, or quests
- **Filtering Options**: Browse data by category
- **Beautiful Cards**: RPG-themed display of collected information

## 🛠️ Installation

The Encyclopedia feature is already integrated into your BDAutomator installation. Simply install the new dependencies:

```bash
npm install
```

## 📖 Usage

### Starting Encyclopedia Crawling

1. **Add an Account**: Use an existing account or create a new one with valid game credentials
2. **Click Encyclopedia Button**: Look for the "📚 Encyclopedia" button on your account
3. **Monitor Progress**: Watch the terminal output for crawling progress
4. **View Results**: Switch to the "📚 Encyclopedia" tab to browse collected data

### Encyclopedia Tab Features

#### Statistics Dashboard
- **Items Count**: Total number of collected items
- **Monsters Count**: Total number of collected monsters  
- **Skills Count**: Total number of collected skills
- **Quests Count**: Total number of collected quests

#### Search & Filter
- **Global Search**: Search across all data types
- **Category Filters**: View specific data types (Items, Monsters, Skills, Quests)
- **Refresh Button**: Update all data from the database

#### Data Display
- **Grid Layout**: Responsive card-based display
- **Detailed Information**: Comprehensive data for each entry
- **Hover Effects**: Interactive cards with smooth animations

## 🗄️ Database Structure

The Encyclopedia uses SQLite with the following tables:

### Items Table
```sql
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  rarity TEXT,
  level INTEGER,
  stats TEXT, -- JSON string
  description TEXT,
  image_url TEXT,
  source TEXT,
  created_at DATETIME,
  updated_at DATETIME
);
```

### Monsters Table
```sql
CREATE TABLE monsters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level INTEGER,
  hp INTEGER,
  attack INTEGER,
  defense INTEGER,
  skills TEXT, -- JSON string
  drops TEXT, -- JSON string
  location TEXT,
  image_url TEXT,
  created_at DATETIME,
  updated_at DATETIME
);
```

### Skills Table
```sql
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  level INTEGER,
  cooldown INTEGER,
  description TEXT,
  effects TEXT, -- JSON string
  requirements TEXT, -- JSON string
  image_url TEXT,
  created_at DATETIME,
  updated_at DATETIME
);
```

### Quests Table
```sql
CREATE TABLE quests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  level_requirement INTEGER,
  description TEXT,
  objectives TEXT, -- JSON string
  rewards TEXT, -- JSON string
  npc TEXT,
  location TEXT,
  created_at DATETIME,
  updated_at DATETIME
);
```

### Crawl Sessions Table
```sql
CREATE TABLE crawl_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  status TEXT DEFAULT 'running',
  start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  end_time DATETIME,
  items_found INTEGER DEFAULT 0,
  monsters_found INTEGER DEFAULT 0,
  skills_found INTEGER DEFAULT 0,
  quests_found INTEGER DEFAULT 0,
  errors TEXT
);
```

## 🔧 Technical Details

### Architecture
- **Main Process**: Manages encyclopedia processes and database operations
- **Renderer Process**: Handles UI updates and user interactions
- **Child Process**: Runs Puppeteer for web scraping
- **Database Layer**: SQLite for persistent storage

### Data Flow
1. User initiates encyclopedia crawling
2. Main process creates child process with account credentials
3. Child process logs into game and navigates to library sections
4. Data is extracted using Puppeteer and page evaluation
5. Extracted data is sent back to main process
6. Main process stores data in SQLite database
7. UI is updated with new data and statistics

### Error Handling
- **Network Timeouts**: Automatic retry with exponential backoff
- **Page Changes**: Flexible selectors that adapt to layout changes
- **Login Failures**: Clear error messages and graceful fallback
- **Database Errors**: Transaction rollback and error logging

## 🎯 Customization

### Adding New Data Types
To add support for new game data types:

1. **Update Database Schema**: Add new table in `EncyclopediaService.initDatabase()`
2. **Add Crawler Method**: Implement new crawling function in `EncyclopediaCrawler`
3. **Update UI**: Add new filter button and display grid
4. **Add IPC Handlers**: Handle new data type in main process

### Modifying Data Extraction
The crawler uses flexible selectors that can be easily modified:

```javascript
// Example: Custom item extraction
const items = await this.page.evaluate(() => {
  const itemElements = document.querySelectorAll('.custom-item-selector');
  return Array.from(itemElements).map(element => {
    // Custom extraction logic
    return {
      name: element.querySelector('.custom-name')?.textContent?.trim(),
      // ... other fields
    };
  });
});
```

## 🚨 Important Notes

### Rate Limiting
- The crawler includes delays between requests to avoid overwhelming the server
- Respect the game's terms of service and avoid excessive requests
- Consider running during off-peak hours for better performance

### Data Accuracy
- Crawled data represents a snapshot in time
- Game updates may change item stats, monster abilities, etc.
- Regular re-crawling is recommended to maintain data freshness

### Storage
- Data is stored locally in `encyclopedia.db`
- Database file grows with collected data
- Consider backing up the database file regularly

## 🔍 Troubleshooting

### Common Issues

#### Crawling Fails to Start
- Verify account credentials are correct
- Check if the game website is accessible
- Ensure Puppeteer dependencies are installed

#### No Data Collected
- Verify the game library pages are accessible
- Check browser console for JavaScript errors
- Review the crawler's page selectors

#### Database Errors
- Ensure write permissions in the application directory
- Check if the database file is corrupted
- Try deleting the database file to start fresh

### Debug Mode
Enable detailed logging by checking the terminal output for:
- `[Encyclopedia]` prefixed messages
- Puppeteer navigation logs
- Database operation confirmations

## 📈 Future Enhancements

### Planned Features
- **Export Functionality**: CSV, JSON, and Excel export options
- **Data Visualization**: Charts and graphs for statistics
- **Scheduled Crawling**: Automatic data updates at set intervals
- **API Integration**: Webhook support for external systems
- **Data Comparison**: Track changes between crawling sessions

### Community Contributions
- **Custom Extractors**: User-defined data extraction rules
- **Plugin System**: Third-party encyclopedia extensions
- **Data Sharing**: Community-driven data repositories

## 📞 Support

For issues or questions about the Encyclopedia feature:

1. Check the terminal output for error messages
2. Review this documentation for common solutions
3. Check the game website for recent changes
4. Verify your account has access to the library sections

---

**Happy Crawling! 🕷️📚**

*The Encyclopedia feature transforms your game knowledge into a powerful, searchable database that grows with every crawl session.*
