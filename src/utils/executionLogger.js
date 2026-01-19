//src/utils/executionLogger.js

class ExecutionLogger {
  constructor(operationName) {
    this.operationName = operationName;
    this.startTime = Date.now();
    this.logs = [];
  }

  log(message, data = null) {
    const timestamp = Date.now() - this.startTime;
    const time = new Date(Date.now());
    const formatted = `[${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}.${timestamp.toString().padStart(3, '0')}]`;
    
    const entry = {
      timestamp: formatted,
      message,
      data,
      elapsed: timestamp
    };
    
    this.logs.push(entry);
    console.log(`${formatted} [${this.operationName}] ${message}`, data || '');
    
    return entry;
  }

  getLogs() {
    return this.logs;
  }

  getFormattedLogs() {
    return this.logs.map(entry => 
      `${entry.timestamp} ${entry.message}${entry.data ? ` ${JSON.stringify(entry.data)}` : ''}`
    );
  }

  getDuration() {
    return Date.now() - this.startTime;
  }
}

export default ExecutionLogger;