import { Effect, Schema } from 'effect';
import {
  onMessagePublished,
  PubSubOptions,
  MessagePublishedData,
} from 'firebase-functions/v2/pubsub';
import { CloudEvent, CloudFunction } from 'firebase-functions/v2';
import { run, Runtime } from './run.js';
import { logger } from 'firebase-functions';

interface MessagePublishedEffectOptions<R> extends PubSubOptions {
  runtime: Runtime<R>;
}

interface MessagePublishedEffectOptionsWithSchema<
  R,
  S extends Schema.Schema.Any
> extends MessagePublishedEffectOptions<R> {
  messageSchema: S;
}

/**
 * Decode the message JSON data using the provided schema.
 */
function decodeMessageData<S extends Schema.Schema.Any>(
  schema: S,
  event: CloudEvent<MessagePublishedData<unknown>>
): Effect.Effect<Schema.Schema.Type<S>, Error, Schema.Schema.Context<S>> {
  const messageData = event.data.message.json;
  return Schema.decodeUnknown(schema)(messageData).pipe(
    Effect.mapError(
      (error) => new Error(`Failed to decode Pub/Sub message: ${error.message}`)
    )
  ) as Effect.Effect<Schema.Schema.Type<S>, Error, Schema.Schema.Context<S>>;
}

/**
 * Create a Firebase Functions Pub/Sub trigger that runs an effect when a message is published.
 *
 * @param options - The options for the Pub/Sub trigger including optional message schema.
 * @param handler - The handler function that runs the effect.
 * @returns The Firebase Functions Pub/Sub trigger.
 */
// Overload: with message schema
export function onMessagePublishedEffect<R, S extends Schema.Schema.Any, E>(
  options: MessagePublishedEffectOptionsWithSchema<R, S>,
  handler: (
    message: Schema.Schema.Type<S>,
    event: CloudEvent<MessagePublishedData<Schema.Schema.Type<S>>>
  ) => Effect.Effect<void, E, R>
): CloudFunction<CloudEvent<MessagePublishedData<Schema.Schema.Type<S>>>>;

// Overload: without message schema (full control)
export function onMessagePublishedEffect<R, T, E>(
  options: MessagePublishedEffectOptions<R>,
  handler: (
    event: CloudEvent<MessagePublishedData<T>>
  ) => Effect.Effect<void, E, R>
): CloudFunction<CloudEvent<MessagePublishedData<T>>>;

// Implementation
export function onMessagePublishedEffect<R>(
  options: MessagePublishedEffectOptions<R> & {
    messageSchema?: Schema.Schema.Any;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => Effect.Effect<void, unknown, R>
): CloudFunction<CloudEvent<MessagePublishedData<unknown>>> {
  const { messageSchema } = options;

  return onMessagePublished(options, async (event) => {
    const effect = Effect.gen(function* () {
      if (messageSchema) {
        // Decode message data and pass to handler
        const messageData = yield* decodeMessageData(messageSchema, event);
        return yield* handler(messageData, event);
      } else {
        // Pass raw event to handler
        return yield* handler(event);
      }
    });

    await run(options.runtime, effect as Effect.Effect<void, never, R>).catch(
      (error) => {
        logger.error('Defect in onMessagePublished', {
          inner: error,
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    );
  });
}
