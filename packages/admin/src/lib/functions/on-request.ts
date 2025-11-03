import { Effect, ManagedRuntime } from 'effect';
import {
  onRequest,
  HttpsFunction,
  HttpsOptions,
  Request,
} from 'firebase-functions/https';
import { Response } from 'express';
import { run } from './run.js';
import { logger } from 'firebase-functions';

interface RequestEffectOptions<R> extends HttpsOptions {
  runtime: ManagedRuntime.ManagedRuntime<R, never>;
}

/**
 * Create a Firebase Functions HTTP trigger that runs an effect.
 * @param options - The options for the HTTP trigger.
 * @param handler - The handler function that runs the effect.
 * @returns The Firebase Functions HTTP trigger.
 */
export function onRequestEffect<R>(
  options: RequestEffectOptions<R>,
  handler: (
    request: Request,
    response: Response
  ) => Effect.Effect<void, never, R>
): HttpsFunction {
  return onRequest(options, async (request, response) => {
    await run(options.runtime, handler(request, response)).catch((error) => {
      logger.error('Unrecoverable error', {
        inner: error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      response.status(500).send();
    });
  });
}
