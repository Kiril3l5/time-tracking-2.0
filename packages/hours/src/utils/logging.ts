/**
 * Logging utility functions for consistent logging across the application
 * These functions provide a way to log with different severity levels
 * and could be extended to send logs to external monitoring services
 */

// Log levels
export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
}

// Base logging function with level, message and optional metadata
export function log(level: LogLevel, message: string, metadata?: unknown): void {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] [${level}] ${message}`;

  // In production, this could be replaced with a proper logging service
  switch (level) {
    case LogLevel.ERROR:
      // eslint-disable-next-line no-console
      console.error(formattedMessage, metadata);
      break;
    case LogLevel.WARN:
      // eslint-disable-next-line no-console
      console.warn(formattedMessage, metadata);
      break;
    case LogLevel.INFO:
      // eslint-disable-next-line no-console
      console.info(formattedMessage, metadata);
      break;
    case LogLevel.DEBUG:
      // eslint-disable-next-line no-console
      console.debug(formattedMessage, metadata);
      break;
    default:
      // eslint-disable-next-line no-console
      console.log(formattedMessage, metadata);
  }
}

// Convenience functions for different log levels
export function logError(message: string, metadata?: unknown): void {
  log(LogLevel.ERROR, message, metadata);
}

export function logWarn(message: string, metadata?: unknown): void {
  log(LogLevel.WARN, message, metadata);
}

export function logInfo(message: string, metadata?: unknown): void {
  log(LogLevel.INFO, message, metadata);
}

export function logDebug(message: string, metadata?: unknown): void {
  log(LogLevel.DEBUG, message, metadata);
}
