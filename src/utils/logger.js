// src/utils/logger.js

class Logger {
  constructor() {
    this.prefix = '[Support-Assist]';
  }

  info(context, message, data = null) {
    const log = {
      level: 'INFO',
      context,
      message,
      timestamp: new Date().toISOString()
    };
    
    if (data) {
      log.data = data;
    }
    
    console.log(`${this.prefix}[INFO]`, JSON.stringify(log));
  }

  error(context, message, error = null) {
    const log = {
      level: 'ERROR',
      context,
      message,
      timestamp: new Date().toISOString()
    };
    
    if (error) {
      log.error = {
        message: error.message,
        stack: error.stack,
        name: error.name
      };
    }
    
    console.error(`${this.prefix}[ERROR]`, JSON.stringify(log));
  }

  warn(context, message, data = null) {
    const log = {
      level: 'WARN',
      context,
      message,
      timestamp: new Date().toISOString()
    };
    
    if (data) {
      log.data = data;
    }
    
    console.warn(`${this.prefix}[WARN]`, JSON.stringify(log));
  }

  debug(context, message, data = null) {
    const log = {
      level: 'DEBUG',
      context,
      message,
      timestamp: new Date().toISOString()
    };
    
    if (data) {
      log.data = data;
    }
    
    console.log(`${this.prefix}[DEBUG]`, JSON.stringify(log));
  }

  /**
   * Log API call metrics
   */
  apiCall(context, endpoint, duration, success = true) {
    this.info(context, 'API Call', {
      endpoint,
      duration_ms: duration,
      success
    });
  }

  /**
   * Log performance metrics
   */
  performance(context, operation, duration, metadata = {}) {
    this.info(context, 'Performance', {
      operation,
      duration_ms: duration,
      ...metadata
    });
  }
}

export default new Logger();
