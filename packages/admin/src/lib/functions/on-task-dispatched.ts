import { Effect, Schema } from 'effect';
import {
  onTaskDispatched,
  Request,
  TaskQueueFunction,
  TaskQueueOptions,
} from 'firebase-functions/v2/tasks';
import { logger } from 'firebase-functions';
import { run, Runtime } from './run.js';

interface TaskDispatchedEffectOptions<R> extends TaskQueueOptions {
  runtime: Runtime<R>;
}

interface TaskDispatchedEffectOptionsWithSchema<R, S extends Schema.Schema.Any>
  extends TaskDispatchedEffectOptions<R | Schema.Schema.Context<S>> {
  dataSchema: S;
}

/**
 * Decode task payload JSON data using the provided schema.
 */
function decodeTaskData<S extends Schema.Schema.Any>(
  schema: S,
  request: Request<unknown>
): Effect.Effect<Schema.Schema.Type<S>, Error, Schema.Schema.Context<S>> {
  return Schema.decodeUnknown(schema)(request.data).pipe(
    Effect.mapError(
      (error) => new Error(`Failed to decode task payload: ${error.message}`)
    )
  ) as Effect.Effect<Schema.Schema.Type<S>, Error, Schema.Schema.Context<S>>;
}

/**
 * Create a Firebase Functions Cloud Tasks trigger that runs an effect when a task is dispatched.
 *
 * @param options - The options for the Cloud Tasks trigger including optional payload schema.
 * @param handler - The handler function that runs the effect.
 * @returns The Firebase Functions Cloud Tasks trigger.
 */
// Overload: with payload schema
export function onTaskDispatchedEffect<R, S extends Schema.Schema.Any, E>(
  options: TaskDispatchedEffectOptionsWithSchema<R, S>,
  handler: (
    data: Schema.Schema.Type<S>,
    request: Request<Schema.Schema.Encoded<S>>
  ) => Effect.Effect<void, E, R>
): TaskQueueFunction<Schema.Schema.Encoded<S>>;

// Overload: without payload schema (full control)
export function onTaskDispatchedEffect<R, T, E>(
  options: TaskDispatchedEffectOptions<R>,
  handler: (request: Request<T>) => Effect.Effect<void, E, R>
): TaskQueueFunction<T>;

// Implementation
export function onTaskDispatchedEffect<R>(
  options: TaskDispatchedEffectOptions<R> & {
    dataSchema?: Schema.Schema.Any;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => Effect.Effect<void, unknown, R>
): TaskQueueFunction<unknown> {
  const { dataSchema } = options;

  return onTaskDispatched(options, async (request) => {
    const effect = Effect.gen(function* () {
      if (dataSchema) {
        // Decode task payload and pass both parsed payload and request to handler
        const taskData = yield* decodeTaskData(dataSchema, request);
        return yield* handler(taskData, request);
      } else {
        // Pass raw request to handler
        return yield* handler(request);
      }
    });

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
