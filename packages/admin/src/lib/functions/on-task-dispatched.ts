import { Effect, Schema } from 'effect';
import {
  onTaskDispatched,
  Request,
  TaskQueueFunction,
  TaskQueueOptions,
} from 'firebase-functions/v2/tasks';
import { logger } from 'firebase-functions';
import { run, Runtime } from './run.js';
import { FunctionSetupError, isFunctionSetupError } from './setup-error.js';

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
    const effect = Effect.gen(function* () {
      if (schema) {
        // Decode task payload and pass both parsed payload and request to handler
        const taskData = yield* decodeTaskData(schema, request);
        return yield* handler(taskData, request);
      } else {
        // Pass raw request to handler
        return yield* handler(request);
      }
    }).pipe(
      Effect.catchIf(isFunctionSetupError, (error) =>
        options.onSetupError
          ? options.onSetupError(error, request)
          : Effect.die(error),
      ),
      Effect.withSpan('onTaskDispatchedEffect'),
    );

    await run(options.runtime, effect as Effect.Effect<void, never, R>).catch(
      (error) => {
        logger.error('Defect in onTaskDispatched', {
          inner: error,
          stack: error instanceof Error ? error.stack : undefined,
        });
      },
    );
  });
}
