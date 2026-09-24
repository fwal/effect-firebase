import { Effect, Schema } from 'effect';
import {
  onTaskDispatched,
  Request,
  TaskQueueFunction,
  TaskQueueOptions,
} from 'firebase-functions/v2/tasks';
import { logger } from 'firebase-functions';
import { run, Runtime } from './run.js';
import { FunctionSetupError } from './setup-error.js';
import { isExpectedRejection } from './report.js';

interface TaskDispatchedEffectOptions<R> extends TaskQueueOptions {
  runtime: Runtime<R>;
  /**
   * Recover from errors raised during function setup (task payload not
   * matching the schema). Use this to e.g. acknowledge and skip malformed
   * payloads instead of treating them as defects.
   *
   * When omitted, the setup error is treated as a defect and logged.
   */
  onSetupError?: (
    error: FunctionSetupError,
    request: Request<unknown>,
  ) => Effect.Effect<void, never, R>;
}

interface TaskDispatchedEffectOptionsWithSchema<
  R,
  S extends Schema.Top,
> extends TaskDispatchedEffectOptions<R | S['DecodingServices']> {
  schema: S;
}

/**
 * Decode task payload JSON data using the provided schema.
 */
function decodeTaskData<S extends Schema.Top>(
  schema: S,
  request: Request<unknown>,
): Effect.Effect<
  Schema.Schema.Type<S>,
  FunctionSetupError,
  S['DecodingServices']
> {
  return Schema.decodeUnknownEffect(schema)(request.data).pipe(
    Effect.mapError(
      (cause) => new FunctionSetupError({ phase: 'decode-task', cause }),
    ),
  ) as Effect.Effect<
    Schema.Schema.Type<S>,
    FunctionSetupError,
    S['DecodingServices']
  >;
}

/**
 * Create a Firebase Functions Cloud Tasks trigger that runs an effect when a task is dispatched.
 *
 * @param options - The options for the Cloud Tasks trigger including optional payload schema.
 * @param handler - The handler function that runs the effect.
 * @returns The Firebase Functions Cloud Tasks trigger.
 */
// Overload: with payload schema
export function onTaskDispatchedEffect<R, S extends Schema.Top, E>(
  options: TaskDispatchedEffectOptionsWithSchema<R, S>,
  handler: (
    data: Schema.Schema.Type<S>,
    request: Request<Schema.Codec.Encoded<S>>,
  ) => Effect.Effect<void, E, R>,
): TaskQueueFunction<Schema.Codec.Encoded<S>>;

// Overload: without payload schema (full control)
export function onTaskDispatchedEffect<R, T, E>(
  options: TaskDispatchedEffectOptions<R>,
  handler: (request: Request<T>) => Effect.Effect<void, E, R>,
): TaskQueueFunction<T>;

// Implementation
export function onTaskDispatchedEffect<R>(
  options: TaskDispatchedEffectOptions<R> & {
    schema?: Schema.Top;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => Effect.Effect<void, unknown, R>,
): TaskQueueFunction<unknown> {
  const { schema } = options;

  return onTaskDispatched(options, async (request) => {
    const recover = (error: FunctionSetupError) =>
      options.onSetupError
        ? options.onSetupError(error, request)
        : Effect.die(error);

    // Recovery covers decoding only; a handler failure stays its own error.
    const effect = (
      schema
        ? decodeTaskData(schema, request).pipe(
            Effect.matchEffect({
              onFailure: (error) => recover(error),
              onSuccess: (taskData) => handler(taskData, request),
            }),
          )
        : handler(request)
    ).pipe(Effect.withSpan('onTaskDispatchedEffect'));

    // Rethrow after logging so the invocation is recorded as failed and
    // Cloud Tasks' retry configuration applies. Swallowing the error made the
    // SDK answer HTTP 204, so Cloud Tasks deleted the task and retryConfig was
    // inert on the handler-failure path.
    await run(options.runtime, effect as Effect.Effect<void, never, R>).catch(
      (error) => {
        // Expected rejections (an HttpsError, or any error annotated with
        // ErrorReporter.ignore) are rethrown for Cloud Tasks' retry contract
        // but are not logged as defects.
        if (!isExpectedRejection(error)) {
          logger.error('Defect in onTaskDispatched', {
            inner: error,
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
        throw error;
      },
    );
  });
}
