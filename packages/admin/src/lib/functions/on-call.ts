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
import { FunctionSetupError } from './setup-error.js';
import { isExpectedRejection } from './report.js';

interface CallEffectOptions<R, A = unknown> extends CallableOptions {
  runtime: Runtime<R>;
  /**
   * Recover from errors raised during function setup (input decoding or
   * output encoding). The returned effect either succeeds with a fallback
   * response for the client — typed as whatever this function returns — or
   * fails with an `HttpsError` to reject the call.
   *
   * When omitted, an input decode failure is rejected with an
   * `invalid-argument` HttpsError and an output encode failure with an
   * `internal` HttpsError.
   */
  onSetupError?: (
    error: FunctionSetupError,
    request: CallableRequest,
  ) => Effect.Effect<A, HttpsError, R>;
}

interface CallEffectOptionsWithInput<
  R,
  I extends Schema.Top,
  T,
> extends CallEffectOptions<R, T> {
  inputSchema: I;
}

interface CallEffectOptionsWithOutput<
  R,
  O extends Schema.Top,
> extends CallEffectOptions<R, Schema.Codec.Encoded<O>> {
  outputSchema: O;
}

interface CallEffectOptionsWithBoth<
  R,
  I extends Schema.Top,
  O extends Schema.Top,
> extends CallEffectOptions<R, Schema.Codec.Encoded<O>> {
  inputSchema: I;
  outputSchema: O;
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
  options: CallEffectOptionsWithInput<R, I, T>,
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
  options: CallEffectOptions<R, T>,
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
    const recover = (error: FunctionSetupError) =>
      onSetupError
        ? onSetupError(error, request)
        : defaultSetupErrorResponse(error);

    // Boundary step 1: decode the input. Its only failure is a setup error.
    const decoded = inputSchema
      ? decodeInput(inputSchema)(request).pipe(
          Effect.mapError(
            (cause) => new FunctionSetupError({ phase: 'decode-input', cause }),
          ),
        )
      : Effect.succeed(request);

    // Boundary step 2: encode the handler's output, likewise.
    const encode = (output: unknown) =>
      outputSchema
        ? encodeOutput(outputSchema)(output).pipe(
            Effect.mapError(
              (cause) =>
                new FunctionSetupError({ phase: 'encode-output', cause }),
            ),
            Effect.catch(recover),
          )
        : Effect.succeed(output);

    const effect = decoded.pipe(
      Effect.matchEffect({
        // Decoding failed, so the handler never runs.
        onFailure: (error) => recover(error),
        // Recovery is deliberately NOT wrapped around the handler: a handler
        // failure is the handler's own error, even when it happens to be a
        // FunctionSetupError, and must reach the caller unchanged.
        onSuccess: (inputOrRequest) =>
          pipe(
            inputSchema
              ? handler(inputOrRequest, extractContext(request, response))
              : handler(request, response),
            Effect.andThen((output) => encode(output)),
          ),
      }),
      Effect.withSpan('onCallEffect'),
    );

    const exit = await runExit(
      options.runtime,
      effect as Effect.Effect<unknown, unknown, R>,
    );

    if (Exit.isSuccess(exit)) {
      return exit.value;
    }

    const error = Cause.squash(exit.cause);
    // Expected rejections (an HttpsError, or any error annotated with
    // ErrorReporter.ignore) are rethrown for Firebase to serialize, so the
    // client receives their code and message, but are not logged as defects.
    if (!isExpectedRejection(error)) {
      logger.error('Defect in onCall', {
        inner: error,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    throw error;
  });
}
