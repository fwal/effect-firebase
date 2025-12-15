import { Effect, pipe, Schema } from 'effect';
import {
  onRequest,
  HttpsFunction,
  HttpsOptions,
  Request,
} from 'firebase-functions/https';
import { type Response } from 'express';
import { run, Runtime } from './run.js';
import { logger } from 'firebase-functions';
import { parseBody, sendJson } from './on-request-helpers.js';

interface RequestEffectOptions<R> extends HttpsOptions {
  runtime: Runtime<R>;
}

interface RequestEffectOptionsWithBody<R, B extends Schema.Schema.Any>
  extends RequestEffectOptions<R> {
  bodySchema: B;
}

interface RequestEffectOptionsWithResponse<R, O extends Schema.Schema.Any>
  extends RequestEffectOptions<R> {
  responseSchema: O;
  successStatus?: number;
}

interface RequestEffectOptionsWithBoth<
  R,
  B extends Schema.Schema.Any,
  O extends Schema.Schema.Any
> extends RequestEffectOptions<R> {
  bodySchema: B;
  responseSchema: O;
  successStatus?: number;
}

/**
 * Create a Firebase Functions HTTP trigger that runs an effect.
 *
 * @param options - The options for the HTTP trigger including optional schemas.
 * @param handler - The handler function that runs the effect.
 * @returns The Firebase Functions HTTP trigger.
 */
// Overload: both body and response schemas (JSON API endpoint)
export function onRequestEffect<
  R,
  B extends Schema.Schema.Any,
  O extends Schema.Schema.Any,
  E
>(
  options: RequestEffectOptionsWithBoth<R, B, O>,
  handler: (
    body: Schema.Schema.Type<B>,
    request: Request,
    response: Response
  ) => Effect.Effect<Schema.Schema.Type<O>, E, R>
): HttpsFunction;

// Overload: only body schema
export function onRequestEffect<R, B extends Schema.Schema.Any, E>(
  options: RequestEffectOptionsWithBody<R, B>,
  handler: (
    body: Schema.Schema.Type<B>,
    request: Request,
    response: Response
  ) => Effect.Effect<void, E, R>
): HttpsFunction;

// Overload: only response schema
export function onRequestEffect<R, O extends Schema.Schema.Any, E>(
  options: RequestEffectOptionsWithResponse<R, O>,
  handler: (
    request: Request,
    response: Response
  ) => Effect.Effect<Schema.Schema.Type<O>, E, R>
): HttpsFunction;

// Overload: no schemas (full control)
export function onRequestEffect<R, E>(
  options: RequestEffectOptions<R>,
  handler: (request: Request, response: Response) => Effect.Effect<void, E, R>
): HttpsFunction;

// Implementation
export function onRequestEffect<R>(
  options: RequestEffectOptions<R> & {
    bodySchema?: Schema.Schema.Any;
    responseSchema?: Schema.Schema.Any;
    successStatus?: number;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => Effect.Effect<unknown, unknown, R>
): HttpsFunction {
  const { bodySchema, responseSchema, successStatus = 200 } = options;

  return onRequest(options, async (request, response) => {
    const effect = pipe(
      // Step 1: Parse body if schema provided
      bodySchema ? parseBody(bodySchema)(request) : Effect.succeed(request),

      // Step 2: Run handler with parsed body or raw request
      Effect.andThen((bodyOrRequest) => {
        if (bodySchema) {
          // Handler expects parsed body, request, response
          return handler(bodyOrRequest, request, response);
        } else {
          // Handler expects request, response
          return handler(request, response);
        }
      }),

      // Step 3: Send JSON response if schema provided
      Effect.andThen((output) =>
        responseSchema
          ? sendJson(response, responseSchema, successStatus)(output)
          : Effect.void
      )
    );

    await run(options.runtime, effect as Effect.Effect<void, never, R>).catch(
      (error) => {
        logger.error('Defect in onRequest', {
          inner: error,
          stack: error instanceof Error ? error.stack : undefined,
        });
        response.status(500).send();
      }
    );
  });
}
