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
import { FunctionSetupError, isFunctionSetupError } from './setup-error.js';

interface RequestEffectOptions<R> extends HttpsOptions {
  runtime: Runtime<R>;
  /**
   * Recover from errors raised during function setup (body parsing or
   * response encoding). The returned effect is responsible for writing a
   * response to the client.
   *
   * When omitted, a body parse failure responds with status 400 and a
   * response encode failure with status 500.
   */
  onSetupError?: (
    error: FunctionSetupError,
    request: Request,
    response: Response,
  ) => Effect.Effect<void, never, R>;
}

interface RequestEffectOptionsWithBody<
  R,
  B extends Schema.Top,
> extends RequestEffectOptions<R> {
  bodySchema: B;
}

interface RequestEffectOptionsWithResponse<
  R,
  O extends Schema.Top,
> extends RequestEffectOptions<R> {
  responseSchema: O;
  successStatus?: number;
}

interface RequestEffectOptionsWithBoth<
  R,
  B extends Schema.Top,
  O extends Schema.Top,
> extends RequestEffectOptions<R> {
  bodySchema: B;
  responseSchema: O;
  successStatus?: number;
}

/**
 * Default recovery: respond with 400 for an invalid request body and 500 for
 * a response encoding failure.
 */
const defaultSetupErrorResponse = (
  error: FunctionSetupError,
  response: Response,
): Effect.Effect<void> =>
  Effect.sync(() => {
    if (error.phase === 'decode-body') {
      logger.warn('Invalid request body in onRequest', {
        error: error.cause.message,
      });
      response.status(400).json({ error: 'Invalid request body' });
    } else {
      logger.error('Failed to encode response in onRequest', {
        error: error.cause.message,
      });
      response.status(500).send();
    }
  });

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
  B extends Schema.Top,
  O extends Schema.Top,
  E,
>(
  options: RequestEffectOptionsWithBoth<R, B, O>,
  handler: (
    body: Schema.Schema.Type<B>,
    request: Request,
    response: Response,
  ) => Effect.Effect<Schema.Schema.Type<O>, E, R>,
): HttpsFunction;

// Overload: only body schema
export function onRequestEffect<R, B extends Schema.Top, E>(
  options: RequestEffectOptionsWithBody<R, B>,
  handler: (
    body: Schema.Schema.Type<B>,
    request: Request,
    response: Response,
  ) => Effect.Effect<void, E, R>,
): HttpsFunction;

// Overload: only response schema
export function onRequestEffect<R, O extends Schema.Top, E>(
  options: RequestEffectOptionsWithResponse<R, O>,
  handler: (
    request: Request,
    response: Response,
  ) => Effect.Effect<Schema.Schema.Type<O>, E, R>,
): HttpsFunction;

// Overload: no schemas (full control)
export function onRequestEffect<R, E>(
  options: RequestEffectOptions<R>,
  handler: (request: Request, response: Response) => Effect.Effect<void, E, R>,
): HttpsFunction;

// Implementation
export function onRequestEffect<R>(
  options: RequestEffectOptions<R> & {
    bodySchema?: Schema.Top;
    responseSchema?: Schema.Top;
    successStatus?: number;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => Effect.Effect<unknown, unknown, R>,
): HttpsFunction {
  const { bodySchema, responseSchema, successStatus = 200, onSetupError } =
    options;

  return onRequest(options, async (request, response) => {
    const effect = pipe(
      // Step 1: Parse body if schema provided
      bodySchema
        ? parseBody(bodySchema)(request).pipe(
            Effect.mapError(
              (cause) =>
                new FunctionSetupError({ phase: 'decode-body', cause }),
            ),
          )
        : Effect.succeed(request),

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
          ? sendJson(response, responseSchema, successStatus)(output).pipe(
              Effect.mapError(
                (cause) =>
                  new FunctionSetupError({ phase: 'encode-response', cause }),
              ),
            )
          : Effect.void,
      ),

      // Step 4: Recover from setup errors (schema decode/encode failures)
      Effect.catchIf(isFunctionSetupError, (error) =>
        onSetupError
          ? onSetupError(error, request, response)
          : defaultSetupErrorResponse(error, response),
      ),
    ).pipe(Effect.withSpan('onRequestEffect'));

    await run(options.runtime, effect as Effect.Effect<void, never, R>).catch(
      (error) => {
        logger.error('Defect in onRequest', {
          inner: error,
          stack: error instanceof Error ? error.stack : undefined,
        });
        response.status(500).send();
      },
    );
  });
}
