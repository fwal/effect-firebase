import { Context, Data, Effect, Layer, Schema } from 'effect';

/**
 * The JSON wire codec for Pub/Sub messages.
 *
 * Encoding produces a value that survives `JSON.stringify` / `JSON.parse`
 * unchanged (`undefined` becomes `null`, `Date` becomes an ISO string, …), and
 * decoding accepts that value back. `onMessagePublishedEffect` decodes with
 * this codec and {@link publish} encodes with it, so use it too when you
 * publish some other way.
 *
 * @example
 * ```ts
 * import { PubSub } from '@effect-firebase/admin';
 *
 * const json = yield* Schema.encodeEffect(PubSub.messageCodec(UserCreated))(event);
 * await topic.publishMessage({ json });
 * ```
 */
export const messageCodec = <S extends Schema.Top>(
  schema: S,
): Schema.toCodecJson<S> => Schema.toCodecJson(schema);

/**
 * The phase in which {@link publish} failed.
 */
export type PublishPhase = 'encode-message' | 'publish';

/**
 * Raised when a message could not be encoded with {@link messageCodec} or the
 * Pub/Sub client rejected the publish.
 */
export class PubSubPublishError extends Data.TaggedError('PubSubPublishError')<{
  readonly topic: string;
  readonly phase: PublishPhase;
  readonly cause: Schema.SchemaError | Error;
}> {
  override get message(): string {
    return `Publishing to ${this.topic} failed during ${this.phase}: ${this.cause.message}`;
  }
}

/**
 * Options for a single publish. Mirrors the matching fields of
 * `@google-cloud/pubsub`'s `MessageOptions`.
 */
export interface PublishOptions {
  readonly attributes?: Record<string, string>;
  readonly orderingKey?: string;
}

/**
 * The part of a `@google-cloud/pubsub` `PubSub` instance this service uses.
 * A `new PubSub()` from `@google-cloud/pubsub` satisfies it.
 */
export interface Client {
  topic(name: string): {
    publishMessage(message: {
      json: unknown;
      attributes?: Record<string, string>;
      orderingKey?: string;
    }): Promise<string>;
  };
}

export interface PubSubService {
  /**
   * Encode `message` with {@link messageCodec} and publish it as JSON.
   * Succeeds with the server-assigned message id.
   */
  readonly publish: <S extends Schema.Top>(
    topic: string,
    schema: S,
    message: Schema.Schema.Type<S>,
    options?: PublishOptions,
  ) => Effect.Effect<string, PubSubPublishError, S['EncodingServices']>;
}

export class PubSub extends Context.Service<PubSub, PubSubService>()(
  '@effect-firebase/admin/PubSub',
) {}

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

/**
 * Build the service from a Pub/Sub client.
 */
export const make = (client: Client): PubSubService => ({
  publish: <S extends Schema.Top>(
    topic: string,
    schema: S,
    message: Schema.Schema.Type<S>,
    options?: PublishOptions,
  ) =>
    (
      Schema.encodeEffect(messageCodec(schema))(message) as Effect.Effect<
        Schema.Json,
        Schema.SchemaError,
        S['EncodingServices']
      >
    ).pipe(
      Effect.mapError(
        (cause) =>
          new PubSubPublishError({ topic, phase: 'encode-message', cause }),
      ),
      Effect.flatMap((json) =>
        Effect.tryPromise({
          try: () =>
            client.topic(topic).publishMessage({
              json,
              ...(options?.attributes
                ? { attributes: options.attributes }
                : {}),
              ...(options?.orderingKey
                ? { orderingKey: options.orderingKey }
                : {}),
            }),
          catch: (cause) =>
            new PubSubPublishError({
              topic,
              phase: 'publish',
              cause: toError(cause),
            }),
        }),
      ),
      Effect.withSpan('PubSub.publish', { attributes: { topic } }),
    ),
});

/**
 * Provide {@link PubSub} from a Pub/Sub client.
 *
 * @example
 * ```ts
 * import { PubSub as GooglePubSub } from '@google-cloud/pubsub';
 * import { PubSub } from '@effect-firebase/admin';
 *
 * const layer = PubSub.layer(new GooglePubSub());
 * ```
 */
export const layer = (client: Client): Layer.Layer<PubSub> =>
  Layer.succeed(PubSub, make(client));

/**
 * Encode `message` with {@link messageCodec} and publish it as JSON through
 * the {@link PubSub} service. Succeeds with the message id.
 *
 * Do not publish with plain `Schema.encodeEffect(schema)`: an `undefined`
 * field is dropped by `JSON.stringify`, and the consumer then fails with
 * `Missing key`.
 *
 * @example
 * ```ts
 * import { PubSub } from '@effect-firebase/admin';
 *
 * const messageId = yield* PubSub.publish('user-created', UserCreated, event, {
 *   attributes: { source: 'signup' },
 * });
 * ```
 */
export const publish = <S extends Schema.Top>(
  topic: string,
  schema: S,
  message: Schema.Schema.Type<S>,
  options?: PublishOptions,
): Effect.Effect<string, PubSubPublishError, PubSub | S['EncodingServices']> =>
  Effect.gen(function* () {
    const pubsub = yield* PubSub;
    return yield* pubsub.publish(topic, schema, message, options);
  });
