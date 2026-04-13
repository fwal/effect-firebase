import { Logger, LogLevel, Match } from 'effect';
import { logger } from 'firebase-functions';

type LoggerFunction = typeof logger.debug;

const functionForLogLevel: (
  logLevel: LogLevel.LogLevel
) => LoggerFunction | null = (value) =>
  Match.value(value).pipe(
    Match.when('Debug', () => logger.debug),
    Match.when('Trace', () => logger.debug),
    Match.when('Info', () => logger.info),
    Match.when('Warn', () => logger.warn),
    Match.when('Error', () => logger.error),
    Match.when('Fatal', () => logger.error),
    Match.when('All', () => null),
    Match.when('None', () => null),
    Match.exhaustive
  );

/**
 * A logger that writes to the Firebase Functions console.
 */
const cloudConsoleLogger = Logger.make(({ logLevel, message }) => {
  const func = functionForLogLevel(logLevel);
  if (!func) {
    return;
  }
  const messageArray = Array.isArray(message) ? message : [message];
  return func(...messageArray);
});

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
export const cloudConsole = Logger.layer([cloudConsoleLogger]);
