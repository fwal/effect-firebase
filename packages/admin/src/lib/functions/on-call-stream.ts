import { Effect, pipe, Schema, Stream } from 'effect';
import {
  onCall,
  CallableFunction,
  CallableOptions,
  CallableRequest,
  CallableResponse,
} from 'firebase-functions/https';
import { run, Runtime } from './run.js';
import { logger } from 'firebase-functions';
import {
  CallableContext,
  decodeInput,
  extractContext,
} from './on-call-helpers.js';

interface CallStreamEffectOptions<R> extends CallableOptions {
  runtime: Runtime<R>;
}

interface CallStreamEffectOptionsWithInput<
  R,
  I extends Schema.Top,
> extends CallStreamEffectOptions<R> {
  inputSchema: I;
}

interface CallStreamEffectOptionsWithChunk<
  R,
  C extends Schema.Top,
> extends CallStreamEffectOptions<R> {
  chunkSchema: C;
}

interface CallStreamEffectOptionsWithBoth<
  R,
  I extends Schema.Top,
  C extends Schema.Top,
> extends CallStreamEffectOptions<R> {
  inputSchema: I;
  chunkSchema: C;
}

/**
 * Create a Firebase Functions callable trigger that streams the elements of
 * an Effect `Stream` to the client.
 *
 * The handler returns a `Stream`. Each element is encoded with `chunkSchema`
 * (when provided) and sent to the client with `response.sendChunk` while the
 * stream is running. When the stream completes, the collected chunks are
 * returned as the callable's final `data`, so clients that do not support
 * streaming (`httpsCallable(...)(input)` instead of
 * `httpsCallable(...).stream(input)`) still receive the full result.
 *
 * The stream is interrupted when the client disconnects (`response.signal`),
 * including any in-flight pull such as a pending language-model request.
 *
 * @example
 * ```ts
 * export const chat = onCallStreamEffect(
 *   {
 *     runtime,
 *     timeoutSeconds: 540,
 *     inputSchema: Schema.Struct({ prompt: Schema.String }),
 *     chunkSchema: Schema.Struct({ delta: Schema.String }),
 *   },
 *   (input) =>
 *     LanguageModel.streamText({ prompt: input.prompt }).pipe(
 *       Stream.filter((part) => part.type === 'text-delta'),
 *       Stream.map((part) => ({ delta: part.delta })),
 *       Stream.provide(Model),
 *     ),
 * );
 *
 * // client
 * const { stream, data } = await httpsCallable(functions, 'chat').stream({ prompt });
 * for await (const chunk of stream) append(chunk.delta);
 * const allChunks = await data;
 * ```
 *
 * @param options - The options for the callable trigger including optional schemas.
 * @param handler - The handler function that returns a stream of chunks.
 * @returns The Firebase Functions callable trigger.
 */
// Overload: both input and chunk schemas
export function onCallStreamEffect<
  R,
  I extends Schema.Top,
  C extends Schema.Top,
  E,
>(
  options: CallStreamEffectOptionsWithBoth<R, I, C>,
  handler: (
    input: Schema.Schema.Type<I>,
    context: CallableContext,
  ) => Stream.Stream<Schema.Schema.Type<C>, E, R>,
): CallableFunction<
  Schema.Codec.Encoded<I>,
  Promise<ReadonlyArray<Schema.Codec.Encoded<C>>>,
  Schema.Codec.Encoded<C>
>;

// Overload: only input schema
export function onCallStreamEffect<R, A, I extends Schema.Top, E>(
  options: CallStreamEffectOptionsWithInput<R, I>,
  handler: (
    input: Schema.Schema.Type<I>,
    context: CallableContext,
  ) => Stream.Stream<A, E, R>,
): CallableFunction<Schema.Codec.Encoded<I>, Promise<ReadonlyArray<A>>, A>;

// Overload: only chunk schema
export function onCallStreamEffect<R, C extends Schema.Top, E>(
  options: CallStreamEffectOptionsWithChunk<R, C>,
  handler: (
    request: CallableRequest,
    context: CallableContext,
  ) => Stream.Stream<Schema.Schema.Type<C>, E, R>,
): CallableFunction<
  unknown,
  Promise<ReadonlyArray<Schema.Codec.Encoded<C>>>,
  Schema.Codec.Encoded<C>
>;

// Overload: no schemas
export function onCallStreamEffect<R, A, E>(
  options: CallStreamEffectOptions<R>,
  handler: (
    request: CallableRequest,
    context: CallableContext,
  ) => Stream.Stream<A, E, R>,
): CallableFunction<unknown, Promise<ReadonlyArray<A>>, A>;

// Implementation
export function onCallStreamEffect<R>(
  options: CallStreamEffectOptions<R> & {
    inputSchema?: Schema.Top;
    chunkSchema?: Schema.Top;
  },
  handler: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ) => Stream.Stream<unknown, unknown, R>,
): CallableFunction<unknown, Promise<ReadonlyArray<unknown>>, unknown> {
  const { inputSchema, chunkSchema } = options;

  return onCall(options, async (request, response) => {
    const context = extractContext(request, response);

    const effect = pipe(
      // Step 1: Decode input if schema provided
      (inputSchema
        ? decodeInput(inputSchema)(request)
        : Effect.succeed(request)) as Effect.Effect<
        unknown,
        Schema.SchemaError
      >,

      // Step 2: Run handler to obtain the stream, then drain it
      Effect.andThen((inputOrRequest) =>
        pipe(
          handler(inputOrRequest, context),

          // Step 3: Encode each chunk if schema provided
          Stream.mapEffect(
            (chunk): Effect.Effect<unknown, Schema.SchemaError> =>
              chunkSchema
                ? (Schema.encodeUnknownEffect(chunkSchema)(
                    chunk,
                  ) as Effect.Effect<unknown, Schema.SchemaError>)
                : Effect.succeed(chunk),
          ),

          // Step 4: Forward each encoded chunk to the client
          Stream.mapEffect((encoded) =>
            pipe(sendChunk(response, encoded), Effect.as(encoded)),
          ),

          // Step 5: Interrupt the stream (including an in-flight pull) when
          // the client disconnects; chunks collected so far are kept
          Stream.interruptWhen(clientDisconnected(response)),

          // Step 6: Collect all chunks as the final result
          Stream.runCollect,
        ),
      ),
    ).pipe(Effect.withSpan('onCallStreamEffect'));

    return await run(
      options.runtime,
      effect as unknown as Effect.Effect<ReadonlyArray<unknown>, never, R>,
    ).catch((error) => {
      logger.error('Defect in onCallStream', {
        inner: error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    });
  });
}

/**
 * Send a chunk to the client. No-op when the request does not accept
 * streaming or no response object was provided (e.g. in unit tests).
 */
const sendChunk = (
  response: CallableResponse | undefined,
  chunk: unknown,
): Effect.Effect<void> =>
  response
    ? Effect.promise(() => response.sendChunk(chunk)).pipe(Effect.asVoid)
    : Effect.void;

/**
 * An effect that completes when the client disconnects. Never completes when
 * no response object was provided.
 */
const clientDisconnected = (
  response: CallableResponse | undefined,
): Effect.Effect<void> => {
  const signal = response?.signal;
  if (!signal) return Effect.never;
  return Effect.callback<void>((resume) => {
    if (signal.aborted) {
      resume(Effect.void);
      return;
    }
    const onAbort = () => resume(Effect.void);
    signal.addEventListener('abort', onAbort, { once: true });
    return Effect.sync(() => signal.removeEventListener('abort', onAbort));
  });
};
