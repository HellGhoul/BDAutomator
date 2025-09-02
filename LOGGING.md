# Logging System Documentation

## Overview

The BDAutomator now includes a comprehensive logging system that provides detailed tracking of application behavior, making it easier to debug issues and monitor performance.

## Features

### 🔍 **Detailed Logging Information**
- **Timestamp**: ISO 8601 formatted timestamps
- **Log Level**: DEBUG, INFO, WARN, ERROR
- **File Name**: Source file where the log was generated
- **Function Name**: Function/method that generated the log
- **Line Number**: Exact line number in the source file
- **Message**: Descriptive log message
- **Details**: Additional context data (objects, errors, etc.)

### 📁 **File-Based Logging**
- Logs are written to `logs/dependency-analyzer.log`
- JSON format for easy parsing and analysis
- Automatic log rotation (10MB max file size, 5 backup files)
- Structured logging for better analysis

### 🎯 **Specialized Logging Methods**
- `logger.dependencyAnalysis()` - For dependency analysis operations
- `logger.titleParsing()` - For title parsing operations
- `logger.performance()` - For performance metrics
- `logger.exception()` - For error handling with stack traces

## Usage

### Basic Logging

```javascript
const { logger } = require('./logger');

// Different log levels
logger.debug('Debug information');
logger.info('General information');
logger.warn('Warning message');
logger.error('Error message');

// Log with additional details
logger.info('User action', { userId: 123, action: 'login' });

// Log exceptions
try {
  // Some operation
} catch (error) {
  logger.exception('Operation failed', error);
}
```

### Specialized Logging

```javascript
// Dependency analysis logging
logger.dependencyAnalysis('Processing item', 'Spellbinder', { complexity: 5 });

// Title parsing logging
logger.titleParsing('Extracting title', 'Deadly Lich\'s The lich\'s tooth');

// Performance logging
logger.performance('Database query', 150, { table: 'users', rows: 1000 });
```

## Configuration

### Environment Variables

```bash
# Set log level (DEBUG, INFO, WARN, ERROR)
export LOG_LEVEL=DEBUG

# Disable file logging
export LOG_TO_FILE=false

# Disable console logging
export LOG_TO_CONSOLE=false

# Custom log file path
export LOG_FILE_PATH=/path/to/custom.log
```

### Programmatic Configuration

```javascript
const { Logger } = require('./logger');

const customLogger = new Logger({
  logLevel: 'DEBUG',
  logToFile: true,
  logToConsole: false,
  logFilePath: '/custom/path/app.log',
  maxFileSize: 20 * 1024 * 1024, // 20MB
  maxFiles: 10
});
```

## Log Analysis

### Using the Log Viewer

The `log-viewer.js` script provides powerful log analysis capabilities:

```bash
# View log statistics
node log-viewer.js logs/dependency-analyzer.log --stats

# Search for specific text
node log-viewer.js logs/dependency-analyzer.log --search "error"

# Filter by log level
node log-viewer.js logs/dependency-analyzer.log --level ERROR

# Filter by source file
node log-viewer.js logs/dependency-analyzer.log --file dependency-analyzer.js

# Filter by function
node log-viewer.js logs/dependency-analyzer.js --function extractTitleAndBase
```

### Log File Format

Each log entry is a JSON object:

```json
{
  "timestamp": "2025-08-29T03:41:47.319Z",
  "level": "INFO",
  "message": "This is an info message",
  "file": "dependency-analyzer.js",
  "function": "extractTitleAndBase",
  "line": "388",
  "details": {
    "itemName": "Spellbinder",
    "complexity": 5
  }
}
```

## Integration with Dependency Analyzer

The logging system has been integrated into the dependency analyzer to provide detailed tracking of:

- **Data Loading**: When items and titles are loaded
- **Dependency Processing**: Each item's dependency analysis
- **Title Parsing**: Detailed title extraction operations
- **Error Handling**: Exceptions and failures with full context
- **Performance**: Operation timing and resource usage

### Example Log Output

```
[2025-08-29T03:41:47.319Z] [INFO] Loaded 1386 items (dependency-analyzer.js:loadData:25)
[2025-08-29T03:41:47.320Z] [INFO] Loaded 582 titles (dependency-analyzer.js:loadData:35)
[2025-08-29T03:41:47.321Z] [INFO] Starting dependency analysis (dependency-analyzer.js:analyzeDependencies:55)
[2025-08-29T03:41:47.322Z] [INFO] TITLE_PARSING: Extracting title and base from "Deadly Lich's The lich's tooth" (dependency-analyzer.js:extractTitleAndBase:388)
[2025-08-29T03:41:47.323Z] [INFO] TITLE_PARSING: Found title with prefix: "Deadly Lich's" for "Deadly Lich's The lich's tooth" (dependency-analyzer.js:extractTitleAndBase:395)
```

## Troubleshooting

### Common Issues

1. **Log file not created**: Check if the `logs` directory exists and has write permissions
2. **High log volume**: Adjust log level or implement log filtering
3. **Large log files**: Check log rotation settings and adjust `maxFileSize`

### Performance Considerations

- Logging to file is asynchronous and won't block the main thread
- JSON parsing adds minimal overhead
- Stack trace generation only occurs when needed
- Log rotation happens automatically in the background

## Best Practices

1. **Use appropriate log levels**: DEBUG for development, INFO for production
2. **Include relevant context**: Always provide meaningful details
3. **Avoid sensitive data**: Don't log passwords, API keys, or personal information
4. **Structured logging**: Use the details parameter for complex data
5. **Regular monitoring**: Use the log viewer to analyze patterns and issues

## Future Enhancements

- **Log aggregation**: Centralized logging for multiple instances
- **Real-time monitoring**: Web-based log dashboard
- **Alerting**: Automatic notifications for critical errors
- **Metrics**: Performance and usage analytics
- **Integration**: Support for external logging services (ELK, Splunk, etc.)
