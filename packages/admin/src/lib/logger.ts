import { Cause, Formatter, Logger, LogLevel, Match, References } from 'effect';
import { logger } from 'firebase-functions';

type LoggerFunction = typeof logger.debug;

const functionForLogLevel: (
  logLevel: LogLevel.LogLevel,
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
    Match.exhaustive,
  );

/**
 * `firebase-functions` treats a trailing object as the structured payload
 * (`jsonPayload`) only when it is a plain object.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && value.constructor === Object;

/**
 * Makes a payload value JSON-safe with Effect's own `Formatter.formatJson`
 * (bigints, errors, circular references, `Redacted`). Values it still cannot
 * serialize, e.g. a throwing getter, are replaced instead of throwing inside
 * the logger.
 */
const toSafeJson = (value: unknown): unknown => {
  try {
    return JSON.parse(Formatter.formatJson(value));
  } catch {
    return '[Unserializable]';
  }
};

/**
 * Sets a JSON-safe payload field. `constructor` is escaped to
 * `_constructor` because `firebase-functions` only treats the trailing
 * argument as `jsonPayload` while `payload.constructor === Object`. Keys that
 * already look escaped (`_constructor`, `__constructor`, ...) get one more
 * underscore, so no two keys collide; `defineProperty` keeps a
 * `__proto__` key an ordinary field.
 */
const escapeKey = (key: string): string =>
  /^_*constructor$/.test(key) ? `_${key}` : key;

const setField = (
  payload: Record<string, unknown>,
  key: string,
  value: unknown,
): void => {
  Object.defineProperty(payload, escapeKey(key), {
    value: toSafeJson(value),
    enumerable: true,
    writable: true,
    configurable: true,
  });
};

/**
 * Copies every field of `source` into the payload, reading each one inside a
 * guard so a throwing getter cannot make the logger throw.
 */
const assignSafe = (
  payload: Record<string, unknown>,
  source: Readonly<Record<string, unknown>>,
): void => {
  for (const key of Object.keys(source)) {
    let value: unknown;
    try {
      value = source[key];
    } catch {
      value = '[Unserializable]';
    }
    setField(payload, key, value);
  }
};

/**
 * The value to pass alongside the message so the failure is part of the
 * entry's `message`.
 *
 * When the cause squashes to an `Error`, an `Error` that prints exactly the
 * original stack is passed: `util.format` renders that stack into the
 * message, which is what Error Reporting parses and groups by, and it stops
 * `firebase-functions` from synthesising a stack that points at its own
 * logger. It is a copy because Effect errors (`Data.TaggedError`, ...)
 * customise `util.inspect` to print their fields without the stack.
 *
 * Anything else (`Effect.fail('reason')`, interruptions) has no meaningful
 * stack, so the pretty-printed cause is used instead.
 */
const inspectCustom = Symbol.for('nodejs.util.inspect.custom');

const failureForMessage = (cause: Cause.Cause<unknown>): unknown => {
  if (Cause.hasFails(cause) || Cause.hasDies(cause)) {
    const squashed = Cause.squash(cause);
    if (squashed instanceof Error) {
      const error = new Error(squashed.message);
      error.name = squashed.name;
      error.stack = squashed.stack;
      Object.defineProperty(error, inspectCustom, {
        value: () => squashed.stack ?? `${squashed.name}: ${squashed.message}`,
      });
      return error;
    }
  }
  return Cause.pretty(cause);
};

/**
 * A logger that writes to the Firebase Functions console.
 *
 * Log annotations, log spans (as `logSpans: { [label]: durationMs }`) and the
 * pretty-printed cause are merged into the trailing plain object of the
 * message, which `firebase-functions` turns into the entry's `jsonPayload`.
 */
const cloudConsoleLogger = Logger.make(
  ({ logLevel, message, cause, fiber, date }) => {
    const func = functionForLogLevel(logLevel);
    if (!func) {
      return;
    }
    const messageArray: Array<unknown> = Array.isArray(message)
      ? [...message]
      : [message];

    const annotations = fiber.getRef(References.CurrentLogAnnotations);
    const spans = fiber.getRef(References.CurrentLogSpans);
    const hasAnnotations = Object.keys(annotations).length > 0;
    const hasSpans = spans.length > 0;
    const hasCause = cause.reasons.length > 0;

    if (!hasAnnotations && !hasSpans && !hasCause) {
      return func(...messageArray);
    }

    const explicitPayload = isPlainObject(messageArray[messageArray.length - 1])
      ? (messageArray.pop() as Record<string, unknown>)
      : {};

    const payload: Record<string, unknown> = {};
    if (hasSpans) {
      const now = date.getTime();
      const logSpans: Record<string, number> = {};
      for (const [label, startTime] of spans) {
        logSpans[label] = now - startTime;
      }
      setField(payload, 'logSpans', logSpans);
    }
    assignSafe(payload, annotations);
    assignSafe(payload, explicitPayload);
    if (hasCause) {
      setField(payload, 'cause', Cause.pretty(cause));
      messageArray.push(failureForMessage(cause));
    }

    return func(...messageArray, payload);
  },
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
export const cloudConsole = Logger.layer([cloudConsoleLogger]);
