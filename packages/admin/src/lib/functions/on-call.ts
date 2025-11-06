import { Effect, Schema } from 'effect';
import {
  onCall,
  CallableFunction,
  CallableOptions,
  CallableRequest,
  CallableResponse,
} from 'firebase-functions/https';
import { run, Runtime } from './run.js';
import { logger } from 'firebase-functions';

interface CallEffectOptions<R> extends CallableOptions {
  runtime: Runtime<R>;
  inputSchema?: Schema.Schema<unknown, unknown, unknown>;
  outputSchema?: Schema.Schema<unknown, unknown, unknown>;
}

/**
 * Create a Firebase Functions HTTP trigger that runs an effect.
 * @param options - The options for the HTTP trigger.
 * @param handler - The handler function that runs the effect.
 * @returns The Firebase Functions HTTP trigger.
 */
export function onCallEffect<R, T>(
  options: CallEffectOptions<R>,
  handler: (
    request: CallableRequest,
    response?: CallableResponse
  ) => Effect.Effect<T, never, R>
): CallableFunction<T, unknown> {
  return onCall(options, async (request, response) => {
    return await run(options.runtime, handler(request, response)).catch(
      (error) => {
        logger.error('Unrecoverable error', {
          inner: error,
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    );
  });
}
