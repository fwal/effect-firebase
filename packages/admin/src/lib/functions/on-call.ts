import { Cause, Effect, Exit, pipe, Schema } from 'effect';
import {
  onCall,
  CallableFunction,
  CallableOptions,
  CallableRequest,
  CallableResponse,
  HttpsError,
} from 'firebase-functions/https';
import { runExit, Runtime } from './run.js';
import { logger } from 'firebase-functions';
import {
  CallableContext,
  decodeInput,
  encodeOutput,
  extractContext,
} from './on-call-helpers.js';
import { FunctionSetupError, isFunctionSetupError } from './setup-error.js';

interface CallEffectOptions<R> extends CallableOptions {
  runtime: Runtime<R>;
  /**
   * Recover from errors raised during function setup (input decoding or
   * output encoding). The returned effect either succeeds with a fallback
   * response for the client or fails with an `HttpsError` to reject the call.
   *
   * When omitted, an input decode failure is rejected with an
   * `invalid-argument` HttpsError and an output encode failure with an
   * `internal` HttpsError.
   */
  onSetupError?: (
    error: FunctionSetupError,
    request: CallableRequest,
  ) => Effect.Effect<unknown, HttpsError, R>;
}

interface CallEffectOptionsWithInput<
  R,
  I extends Schema.Top,
> extends CallEffectOptions<R> {
  inputSchema: I;
}

interface CallEffectOptionsWithOutput<
  R,
  O extends Schema.Top,
> extends CallEffectOptions<R> {
  outputSchema: O;
  onSetupError?: (
    error: FunctionSetupError,
    request: CallableRequest,
  ) => Effect.Effect<Schema.Codec.Encoded<O>, HttpsError, R>;
}

interface CallEffectOptionsWithBoth<
  R,
  I extends Schema.Top,
  O extends Schema.Top,
> extends CallEffectOptions<R> {
  inputSchema: I;
  outputSchema: O;
  onSetupError?: (
    error: FunctionSetupError,
    request: CallableRequest,
  ) => Effect.Effect<Schema.Codec.Encoded<O>, HttpsError, R>;
}

/**
 * Default recovery: reject the call with an HttpsError that reflects the
 * setup phase that failed.
 */
const defaultSetupErrorResponse = (
  error: FunctionSetupError,
): Effect.Effect<never, HttpsError> =>
  Effect.fail(
    error.phase === 'decode-input'
      ? new HttpsError('invalid-argument', error.cause.message)
      : new HttpsError('internal', 'Failed to encode function output'),
  );

/**
 * Create a Firebase Functions callable trigger that runs an effect.
 *
 * @param options - The options for the callable trigger including optional schemas.
 * @param handler - The handler function that runs the effect.
 * @returns The Firebase Functions callable trigger.
 */
export function onCallEffect<R, I extends Schema.Top, O extends Schema.Top, E>(
  options: CallEffectOptionsWithBoth<R, I, O>,
  handler: (
    input: Schema.Schema.Type<I>,
    context: CallableContext,
  ) => Effect.Effect<Schema.Schema.Type<O>, E, R>,
): CallableFunction<Schema.Codec.Encoded<O>, Schema.Codec.Encoded<I>>;

// Overload: only input schema
export function onCallEffect<R, T, I extends Schema.Top, E>(
  options: CallEffectOptionsWithInput<R, I>,
  handler: (
    input: Schema.Schema.Type<I>,
    context: CallableContext,
  ) => Effect.Effect<T, E, R>,
): CallableFunction<T, Schema.Codec.Encoded<I>>;

// Overload: only output schema
export function onCallEffect<R, O extends Schema.Top, E>(
  options: CallEffectOptionsWithOutput<R, O>,
  handler: (
    request: CallableRequest,
    response?: CallableResponse,
  ) => Effect.Effect<Schema.Schema.Type<O>, E, R>,
): CallableFunction<Schema.Codec.Encoded<O>, unknown>;

// Overload: no schemas
export function onCallEffect<R, T, E>(
  options: CallEffectOptions<R>,
  handler: (
    request: CallableRequest,
    response?: CallableResponse,
  ) => Effect.Effect<T, E, R>,
): CallableFunction<T, unknown>;

// Implementation
export function onCallEffect<R>(
  options: CallEffectOptions<R> & {
    inputSchema?: Schema.Top;
    outputSchema?: Schema.Top;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => Effect.Effect<unknown, unknown, R>,
): CallableFunction<unknown, unknown> {
  const { inputSchema, outputSchema, onSetupError } = options;

  return onCall(options, async (request, response) => {
    const effect = pipe(
      // Step 1: Decode input if schema provided (uses helper)
      inputSchema
        ? decodeInput(inputSchema)(request).pipe(
            Effect.mapError(
              (cause) =>
                new FunctionSetupError({ phase: 'decode-input', cause }),
            ),
          )
        : Effect.succeed(request),

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
          ? encodeOutput(outputSchema)(output).pipe(
              Effect.mapError(
                (cause) =>
                  new FunctionSetupError({ phase: 'encode-output', cause }),
              ),
            )
          : Effect.succeed(output),
      ),

      // Step 4: Recover from setup errors (schema decode/encode failures)
      Effect.catchIf(isFunctionSetupError, (error) =>
        onSetupError
          ? onSetupError(error, request)
          : defaultSetupErrorResponse(error),
      ),
    ).pipe(Effect.withSpan('onCallEffect'));

    const exit = await runExit(
      options.runtime,
      effect as Effect.Effect<unknown, unknown, R>,
    );

    if (Exit.isSuccess(exit)) {
      return exit.value;
    }

    const error = Cause.squash(exit.cause);
    if (error instanceof HttpsError) {
      // Expected rejection: let Firebase serialize the HttpsError so the
      // client receives its code and message instead of a generic internal.
      throw error;
    }
    logger.error('Defect in onCall', {
      inner: error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  });
}
