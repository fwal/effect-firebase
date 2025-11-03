import { HashMap, Logger, LogLevel } from 'effect';
import { logger } from 'firebase-functions';
import { LogSeverity } from 'firebase-functions/logger';

const severityForLogLevel = (
  logLevel: LogLevel.LogLevel
): LogSeverity | undefined => {
  switch (logLevel) {
    case LogLevel.Debug:
      return 'DEBUG';
    case LogLevel.Info:
      return 'INFO';
    case LogLevel.Warning:
      return 'WARNING';
    case LogLevel.Error:
      return 'ERROR';
    case LogLevel.Fatal:
      return 'CRITICAL';
    default:
      return undefined;
  }
};

/**
 * A logger that writes to the Firebase Functions console.
 */
export const CloudLogger = Logger.replace(
  Logger.defaultLogger,
  Logger.make(({ logLevel, message, annotations }) => {
    const severity = severityForLogLevel(logLevel);
    if (severity && typeof message === 'string') {
      const data = Object.fromEntries(HashMap.toEntries(annotations));
      logger.write({ severity, message, ...data });
    }
    logger.warn(`Could not write log message: [${logLevel.label}] ${message}`);
  })
);
