import { Effect, Schema } from 'effect';
import {
  onMessagePublished,
  PubSubOptions,
  MessagePublishedData,
} from 'firebase-functions/v2/pubsub';
import { CloudEvent, CloudFunction } from 'firebase-functions/v2';
import { run, Runtime } from './run.js';
import { logger } from 'firebase-functions';
import { FunctionSetupError } from './setup-error.js';
import { isExpectedRejection } from './report.js';

interface MessagePublishedEffectOptions<R> extends PubSubOptions {
  runtime: Runtime<R>;
  /**
   * Recover from errors raised during function setup (message data not
   * matching the schema). Use this to e.g. acknowledge and skip malformed
   * messages instead of treating them as defects.
   *
   * When omitted, the setup error is treated as a defect and logged.
   */
  onSetupError?: (
    error: FunctionSetupError,
    event: CloudEvent<MessagePublishedData<unknown>>,
  ) => Effect.Effect<void, never, R>;
}

interface MessagePublishedEffectOptionsWithSchema<
  R,
  S extends Schema.Top,
> extends MessagePublishedEffectOptions<R | S['DecodingServices']> {
  messageSchema: S;
}

/**
 * Decode the message JSON data using the provided schema.
 */
function decodeMessageData<S extends Schema.Top>(
  schema: S,
  event: CloudEvent<MessagePublishedData<unknown>>,
): Effect.Effect<
  Schema.Schema.Type<S>,
  FunctionSetupError,
  S['DecodingServices']
> {
  return Effect.try({
    // `message.json` parses the base64 payload on access and throws when it
    // is not valid JSON, before any schema is involved.
    try: () => event.data.message.json,
    catch: (error) =>
      new FunctionSetupError({
        phase: 'decode-message',
        cause: error instanceof Error ? error : new Error(String(error)),
      }),
  }).pipe(
    Effect.flatMap((messageData) =>
      Schema.decodeUnknownEffect(schema)(messageData).pipe(
        Effect.mapError(
          (cause) => new FunctionSetupError({ phase: 'decode-message', cause }),
        ),
      ),
    ),
  ) as Effect.Effect<
    Schema.Schema.Type<S>,
    FunctionSetupError,
    S['DecodingServices']
  >;
}

/**
 * Create a Firebase Functions Pub/Sub trigger that runs an effect when a message is published.
 *
 * @param options - The options for the Pub/Sub trigger including optional message schema.
 * @param handler - The handler function that runs the effect.
 * @returns The Firebase Functions Pub/Sub trigger.
 */
// Overload: with message schema
export function onMessagePublishedEffect<R, S extends Schema.Top, E>(
  options: MessagePublishedEffectOptionsWithSchema<R, S>,
  handler: (
    message: Schema.Schema.Type<S>,
    event: CloudEvent<MessagePublishedData<Schema.Schema.Type<S>>>,
  ) => Effect.Effect<void, E, R>,
): CloudFunction<CloudEvent<MessagePublishedData<Schema.Schema.Type<S>>>>;

// Overload: without message schema (full control)
export function onMessagePublishedEffect<R, T, E>(
  options: MessagePublishedEffectOptions<R>,
  handler: (
    event: CloudEvent<MessagePublishedData<T>>,
  ) => Effect.Effect<void, E, R>,
): CloudFunction<CloudEvent<MessagePublishedData<T>>>;

// Implementation
export function onMessagePublishedEffect<R>(
  options: MessagePublishedEffectOptions<R> & {
    messageSchema?: Schema.Top;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => Effect.Effect<void, unknown, R>,
): CloudFunction<CloudEvent<MessagePublishedData<unknown>>> {
  const { messageSchema } = options;

  return onMessagePublished(options, async (event) => {
    const recover = (error: FunctionSetupError) =>
      options.onSetupError
        ? options.onSetupError(error, event)
        : Effect.die(error);

    // Recovery covers decoding only; a handler failure stays its own error.
    const effect = (
      messageSchema
        ? decodeMessageData(messageSchema, event).pipe(
            Effect.matchEffect({
              onFailure: (error) => recover(error),
              onSuccess: (messageData) => handler(messageData, event),
            }),
          )
        : handler(event)
    ).pipe(Effect.withSpan('onMessagePublishedEffect'));

    // Rethrow after (guarded) logging so the invocation is recorded as
    // failed and Pub/Sub's retry configuration applies. Swallowing the
    // error acknowledged the message without a retry or a failure record.
    await run(options.runtime, effect as Effect.Effect<void, never, R>).catch(
      (error) => {
        // Expected rejections (an HttpsError, or any error annotated with
        // ErrorReporter.ignore) are rethrown for Pub/Sub's retry contract
        // but are not logged as defects.
        if (!isExpectedRejection(error)) {
          logger.error('Defect in onMessagePublished', {
            inner: error,
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
        throw error;
      },
    );
  });
}
