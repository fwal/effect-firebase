import { Effect, Schema } from 'effect';
import {
  onTaskDispatched,
  Request,
  TaskQueueFunction,
  TaskQueueOptions,
} from 'firebase-functions/v2/tasks';
import { logger } from 'firebase-functions';
import { run, Runtime } from 'effect-firebase';

interface TaskDispatchedEffectOptions<R> extends TaskQueueOptions {
  runtime: Runtime<R>;
}

interface TaskDispatchedEffectOptionsWithSchema<R, S extends Schema.Top>
  extends TaskDispatchedEffectOptions<R | S['DecodingServices']> {
  schema: S;
}

/**
 * Decode task payload JSON data using the provided schema.
 */
function decodeTaskData<S extends Schema.Top>(
  schema: S,
  request: Request<unknown>
): Effect.Effect<Schema.Schema.Type<S>, Error, S['DecodingServices']> {
  return Schema.decodeUnknownEffect(schema)(request.data).pipe(
    Effect.mapError(
      (error) => new Error(`Failed to decode task payload: ${error.message}`)
    )
  ) as Effect.Effect<Schema.Schema.Type<S>, Error, S['DecodingServices']>;
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
    request: Request<Schema.Codec.Encoded<S>>
  ) => Effect.Effect<void, E, R>
): TaskQueueFunction<Schema.Codec.Encoded<S>>;

// Overload: without payload schema (full control)
export function onTaskDispatchedEffect<R, T, E>(
  options: TaskDispatchedEffectOptions<R>,
  handler: (request: Request<T>) => Effect.Effect<void, E, R>
): TaskQueueFunction<T>;

// Implementation
export function onTaskDispatchedEffect<R>(
  options: TaskDispatchedEffectOptions<R> & {
    schema?: Schema.Top;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => Effect.Effect<void, unknown, R>
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
    }).pipe(Effect.withSpan('onTaskDispatchedEffect'));

    await run(options.runtime, effect as Effect.Effect<void, never, R>).catch(
      (error) => {
        logger.error('Defect in onTaskDispatched', {
          inner: error,
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    );
  });
}
