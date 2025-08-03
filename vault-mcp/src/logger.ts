/**
 * Vault MCP Server Logger
 * 구조화된 로깅을 위한 로거 모듈입니다.
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: any;
  error?: any;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private enableConsole: boolean;

  private constructor() {
    this.logLevel = this.parseLogLevel(process.env.LOG_LEVEL || "INFO");
    this.enableConsole = process.env.LOG_CONSOLE !== "false";
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toUpperCase()) {
      case "ERROR":
        return LogLevel.ERROR;
      case "WARN":
        return LogLevel.WARN;
      case "INFO":
        return LogLevel.INFO;
      case "DEBUG":
        return LogLevel.DEBUG;
      default:
        return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private formatMessage(entry: LogEntry): string {
    const levelStr = LogLevel[entry.level].padEnd(5);
    const contextStr = entry.context ? `[${entry.context}] ` : "";
    return `${entry.timestamp} ${levelStr} ${contextStr}${entry.message}`;
  }

  private log(
    level: LogLevel,
    message: string,
    context?: string,
    data?: any,
    error?: any
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      data,
      error,
    };

    if (this.enableConsole) {
      const formattedMessage = this.formatMessage(entry);

      switch (level) {
        case LogLevel.ERROR:
          console.error(formattedMessage);
          if (error) {
            console.error("Error details:", error);
          }
          if (data) {
            console.error("Data:", data);
          }
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage);
          if (data) {
            console.warn("Data:", data);
          }
          break;
        case LogLevel.INFO:
          console.error(formattedMessage); // MCP uses stderr for logging
          if (data) {
            console.error("Data:", data);
          }
          break;
        case LogLevel.DEBUG:
          console.error(formattedMessage);
          if (data) {
            console.error("Data:", data);
          }
          break;
      }
    }
  }

  public error(
    message: string,
    context?: string,
    error?: any,
    data?: any
  ): void {
    this.log(LogLevel.ERROR, message, context, data, error);
  }

  public warn(message: string, context?: string, data?: any): void {
    this.log(LogLevel.WARN, message, context, data);
  }

  public info(message: string, context?: string, data?: any): void {
    this.log(LogLevel.INFO, message, context, data);
  }

  public debug(message: string, context?: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, context, data);
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public getLogLevel(): LogLevel {
    return this.logLevel;
  }
}

// 싱글톤 인스턴스 내보내기
export const logger = Logger.getInstance();

// 편의 함수들
export const log = {
  error: (message: string, context?: string, error?: any, data?: any) =>
    logger.error(message, context, error, data),
  warn: (message: string, context?: string, data?: any) =>
    logger.warn(message, context, data),
  info: (message: string, context?: string, data?: any) =>
    logger.info(message, context, data),
  debug: (message: string, context?: string, data?: any) =>
    logger.debug(message, context, data),
  setLogLevel: (level: LogLevel) => logger.setLogLevel(level),
  getLogLevel: () => logger.getLogLevel(),
};
