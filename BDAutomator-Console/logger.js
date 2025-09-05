const fs = require('fs');
const path = require('path');

class Logger {
  constructor(options = {}) {
    this.logLevel = options.logLevel || 'INFO'; // DEBUG, INFO, WARN, ERROR
    this.logToFile = options.logToFile !== false;
    this.logToConsole = options.logToConsole !== false;
    this.logFilePath = options.logFilePath || path.join(__dirname, 'logs', 'dependency-analyzer.log');
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    
    // Ensure logs directory exists
    if (this.logToFile) {
      const logDir = path.dirname(this.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
    
    // Log levels and their numeric values
    this.logLevels = {
      'DEBUG': 0,
      'INFO': 1,
      'WARN': 2,
      'ERROR': 3
    };
  }

  /**
   * Get caller information (file, function, line)
   */
  getCallerInfo() {
    const stack = new Error().stack;
    const lines = stack.split('\n');
    
    // Skip the first few lines (Error constructor, getCallerInfo, log method)
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('dependency-analyzer.js') || line.includes('logger.js')) {
        continue;
      }
      
      // Extract file, function, and line information
      const match = line.match(/at\s+(.+?)\s+\((.+):(\d+):(\d+)\)/);
      if (match) {
        const functionName = match[1];
        const filePath = match[2];
        const lineNumber = match[3];
        const fileName = path.basename(filePath);
        
        return {
          fileName,
          functionName,
          lineNumber,
          fullPath: filePath
        };
      }
    }
    
    return {
      fileName: 'unknown',
      functionName: 'unknown',
      lineNumber: 'unknown',
      fullPath: 'unknown'
    };
  }

  /**
   * Format timestamp
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Check if we should log at the given level
   */
  shouldLog(level) {
    return this.logLevels[level] >= this.logLevels[this.logLevel];
  }

  /**
   * Write log to file
   */
  writeToFile(level, message, callerInfo, details = null) {
    if (!this.logToFile) return;

    try {
      // Check file size and rotate if needed
      this.rotateLogFileIfNeeded();

      const logEntry = {
        timestamp: this.getTimestamp(),
        level: level,
        message: message,
        file: callerInfo.fileName,
        function: callerInfo.functionName,
        line: callerInfo.lineNumber,
        details: details
      };

      const logLine = JSON.stringify(logEntry) + '\n';
      
      fs.appendFileSync(this.logFilePath, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Rotate log file if it exceeds max size
   */
  rotateLogFileIfNeeded() {
    try {
      if (!fs.existsSync(this.logFilePath)) return;

      const stats = fs.statSync(this.logFilePath);
      if (stats.size < this.maxFileSize) return;

      // Rotate existing log files
      for (let i = this.maxFiles - 1; i > 0; i--) {
        const oldFile = `${this.logFilePath}.${i}`;
        const newFile = `${this.logFilePath}.${i + 1}`;
        
        if (fs.existsSync(oldFile)) {
          if (i === this.maxFiles - 1) {
            fs.unlinkSync(oldFile); // Delete oldest file
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }

      // Rename current log file
      fs.renameSync(this.logFilePath, `${this.logFilePath}.1`);
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  /**
   * Log a message
   */
  log(level, message, details = null) {
    if (!this.shouldLog(level)) return;

    const callerInfo = this.getCallerInfo();
    
    // Write to file
    this.writeToFile(level, message, callerInfo, details);
    
    // Write to console
    if (this.logToConsole) {
      const timestamp = this.getTimestamp();
      const prefix = `[${timestamp}] [${level}]`;
      const location = `${callerInfo.fileName}:${callerInfo.functionName}:${callerInfo.lineNumber}`;
      
      console.log(`${prefix} ${message} (${location})`);
      
      if (details) {
        if (details instanceof Error) {
          console.error('Details:', details.message);
          console.error('Stack:', details.stack);
        } else {
          console.log('Details:', details);
        }
      }
    }
  }

  /**
   * Log methods for different levels
   */
  debug(message, details = null) {
    this.log('DEBUG', message, details);
  }

  info(message, details = null) {
    this.log('INFO', message, details);
  }

  warn(message, details = null) {
    this.log('WARN', message, details);
  }

  error(message, details = null) {
    this.log('ERROR', message, details);
  }

  /**
   * Log an exception with full stack trace
   */
  exception(message, error) {
    this.error(message, error);
  }

  /**
   * Log performance metrics
   */
  performance(operation, duration, details = null) {
    this.info(`PERFORMANCE: ${operation} took ${duration}ms`, details);
  }

  /**
   * Log dependency analysis specific information
   */
  dependencyAnalysis(operation, itemName, details = null) {
    this.info(`DEPENDENCY: ${operation} for "${itemName}"`, details);
  }

  /**
   * Log title parsing information
   */
  titleParsing(operation, itemName, details = null) {
    this.info(`TITLE_PARSING: ${operation} for "${itemName}"`, details);
  }

  /**
   * Log automation script information
   */
  automation(operation, scriptName, details = null) {
    this.info(`AUTOMATION: ${operation} for "${scriptName}"`, details);
  }

  /**
   * Log web scraping information
   */
  scraping(operation, url, details = null) {
    this.info(`SCRAPING: ${operation} for "${url}"`, details);
  }

  /**
   * Log data processing information
   */
  dataProcessing(operation, dataType, details = null) {
    this.info(`DATA_PROCESSING: ${operation} for "${dataType}"`, details);
  }

  /**
   * Get log file path
   */
  getLogFilePath() {
    return this.logFilePath;
  }

  /**
   * Clear log file
   */
  clearLog() {
    if (this.logToFile && fs.existsSync(this.logFilePath)) {
      fs.writeFileSync(this.logFilePath, '');
      this.info('Log file cleared');
    }
  }

  /**
   * Get log statistics
   */
  getLogStats() {
    if (!this.logToFile || !fs.existsSync(this.logFilePath)) {
      return { exists: false, size: 0, lines: 0 };
    }

    try {
      const stats = fs.statSync(this.logFilePath);
      const content = fs.readFileSync(this.logFilePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      
      return {
        exists: true,
        size: stats.size,
        lines: lines.length,
        lastModified: stats.mtime
      };
    } catch (error) {
      return { exists: false, error: error.message };
    }
  }
}

// Create default logger instance
const logger = new Logger({
  logLevel: process.env.LOG_LEVEL || 'INFO',
  logToFile: true,
  logToConsole: true,
  logFilePath: path.join(__dirname, 'logs', 'automation.log')
});

module.exports = { Logger, logger };
