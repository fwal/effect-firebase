import { Effect, pipe, Schema } from 'effect';
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
  encodeOutput,
  extractContext,
} from './on-call-helpers.js';

interface CallEffectOptions<R> extends CallableOptions {
  runtime: Runtime<R>;
}

interface CallEffectOptionsWithInput<R, I extends Schema.Schema.Any>
  extends CallEffectOptions<R> {
  inputSchema: I;
}

interface CallEffectOptionsWithOutput<R, O extends Schema.Schema.Any>
  extends CallEffectOptions<R> {
  outputSchema: O;
}

interface CallEffectOptionsWithBoth<
  R,
  I extends Schema.Schema.Any,
  O extends Schema.Schema.Any
> extends CallEffectOptions<R> {
  inputSchema: I;
  outputSchema: O;
}

/**
 * Create a Firebase Functions callable trigger that runs an effect.
 *
 * @param options - The options for the callable trigger including optional schemas.
 * @param handler - The handler function that runs the effect.
 * @returns The Firebase Functions callable trigger.
 */
export function onCallEffect<
  R,
  I extends Schema.Schema.Any,
  O extends Schema.Schema.Any,
  E
>(
  options: CallEffectOptionsWithBoth<R, I, O>,
  handler: (
    input: Schema.Schema.Type<I>,
    context: CallableContext
  ) => Effect.Effect<Schema.Schema.Type<O>, E, R>
): CallableFunction<Schema.Schema.Encoded<O>, Schema.Schema.Encoded<I>>;

// Overload: only input schema
export function onCallEffect<R, T, I extends Schema.Schema.Any, E>(
  options: CallEffectOptionsWithInput<R, I>,
  handler: (
    input: Schema.Schema.Type<I>,
    context: CallableContext
  ) => Effect.Effect<T, E, R>
): CallableFunction<T, Schema.Schema.Encoded<I>>;

// Overload: only output schema
export function onCallEffect<R, O extends Schema.Schema.Any, E>(
  options: CallEffectOptionsWithOutput<R, O>,
  handler: (
    request: CallableRequest,
    response?: CallableResponse
  ) => Effect.Effect<Schema.Schema.Type<O>, E, R>
): CallableFunction<Schema.Schema.Encoded<O>, unknown>;

// Overload: no schemas
export function onCallEffect<R, T, E>(
  options: CallEffectOptions<R>,
  handler: (
    request: CallableRequest,
    response?: CallableResponse
  ) => Effect.Effect<T, E, R>
): CallableFunction<T, unknown>;

// Implementation
export function onCallEffect<R>(
  options: CallEffectOptions<R> & {
    inputSchema?: Schema.Schema.Any;
    outputSchema?: Schema.Schema.Any;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => Effect.Effect<unknown, unknown, R>
): CallableFunction<unknown, unknown> {
  const { inputSchema, outputSchema } = options;

  return onCall(options, async (request, response) => {
    const effect = pipe(
      // Step 1: Decode input if schema provided (uses helper)
      inputSchema ? decodeInput(inputSchema)(request) : Effect.succeed(request),

      // Step 2: Run handler with decoded input or raw request
      Effect.andThen((inputOrRequest) => {
        if (inputSchema) {
          // Handler expects decoded input and context (uses helper)
          return handler(inputOrRequest, extractContext(request));
        } else {
          // Handler expects raw request and response
          return handler(request, response);
        }
      }),

      // Step 3: Encode output if schema provided (uses helper)
      Effect.andThen((output) =>
        outputSchema
          ? encodeOutput(outputSchema)(output)
          : Effect.succeed(output)
      )
    );

    return await run(
      options.runtime,
      effect as Effect.Effect<unknown, never, R>
    ).catch((error) => {
      logger.error('Defect in onCall', {
        inner: error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    });
  });
}
