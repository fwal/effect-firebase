import { Logger, LogLevel, Match } from 'effect';
import { logger } from 'firebase-functions';

type LoggerFunction = typeof logger.debug;
type LogLevelLabel = LogLevel.LogLevel['label'];

const functionForLogLevel: (
  logLevel: LogLevelLabel
) => LoggerFunction | null = (value) =>
  Match.value(value).pipe(
    Match.when('DEBUG', () => logger.debug),
    Match.when('TRACE', () => logger.debug),
    Match.when('INFO', () => logger.info),
    Match.when('WARN', () => logger.warn),
    Match.when('ERROR', () => logger.error),
    Match.when('FATAL', () => logger.error),
    Match.when('ALL', () => null),
    Match.when('OFF', () => null),
    Match.exhaustive
  );

/**
 * A logger that writes to the Firebase Functions console.
 */
const cloudConsoleLogger = Logger.map(
  Logger.structuredLogger,
  ({ logLevel, message, annotations, spans, fiberId, cause }) => {
    const func = functionForLogLevel(logLevel as LogLevelLabel);
    if (!func) {
      return;
    }
    const messageArray = Array.isArray(message) ? message : [message];
    return func(...messageArray, { annotations, spans, fiberId, cause });
  }
);

/**
 * A logger that writes to the Firebase Functions console.
 *
 * @example
 * ```ts
 * import { Effect } from 'effect';
 * import { Logger } from '@effect-firebase/admin';
 *
 * Effect.log('Hello, world!').pipe(Effect.provide(Logger.cloudConsole));
 * ```
 */
export const cloudConsole = Logger.replace(
  Logger.defaultLogger,
  cloudConsoleLogger
);
