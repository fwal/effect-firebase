import { Effect, ManagedRuntime } from 'effect';
import {
  onRequest,
  HttpsFunction,
  HttpsOptions,
  Request,
} from 'firebase-functions/https';
import { Response } from 'express';
import { run } from './run.js';

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
  ) => Effect.Effect<unknown, never, R>
): HttpsFunction {
  return onRequest(options, async (request, response) => {
    const result = await run(options.runtime, handler(request, response));
    response.send(result);
  });
}
