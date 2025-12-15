import { Effect, pipe, Schema } from 'effect';
import { Request, Response } from 'express';
import { ParseError } from 'effect/ParseResult';

/**
 * Parse the request body using a schema.
 *
 * @example
 * ```ts
 * const handler = (request: Request, response: Response) =>
 *   pipe(
 *     request,
 *     parseBody(MyBodySchema),
 *     Effect.andThen((body) => processBody(body))
 *   );
 * ```
 */
export const parseBody =
  <S extends Schema.Schema.Any>(schema: S) =>
  (
    request: Request
  ): Effect.Effect<
    Schema.Schema.Type<S>,
    ParseError,
    Schema.Schema.Context<S>
  > =>
    Schema.decodeUnknown(schema)(request.body) as Effect.Effect<
      Schema.Schema.Type<S>,
      ParseError,
      Schema.Schema.Context<S>
    >;

/**
 * Parse the request query parameters using a schema.
 *
 * @example
 * ```ts
 * const handler = (request: Request, response: Response) =>
 *   pipe(
 *     request,
 *     parseQuery(Schema.Struct({ page: Schema.NumberFromString })),
 *     Effect.andThen(({ page }) => fetchPage(page))
 *   );
 * ```
 */
export const parseQuery =
  <S extends Schema.Schema.Any>(schema: S) =>
  (
    request: Request
  ): Effect.Effect<
    Schema.Schema.Type<S>,
    ParseError,
    Schema.Schema.Context<S>
  > =>
    Schema.decodeUnknown(schema)(request.query) as Effect.Effect<
      Schema.Schema.Type<S>,
      ParseError,
      Schema.Schema.Context<S>
    >;

/**
 * Parse the request URL parameters using a schema.
 *
 * @example
 * ```ts
 * const handler = (request: Request, response: Response) =>
 *   pipe(
 *     request,
 *     parseParams(Schema.Struct({ id: PostId })),
 *     Effect.andThen(({ id }) => getPostById(id))
 *   );
 * ```
 */
export const parseParams =
  <S extends Schema.Schema.Any>(schema: S) =>
  (
    request: Request
  ): Effect.Effect<
    Schema.Schema.Type<S>,
    ParseError,
    Schema.Schema.Context<S>
  > =>
    Schema.decodeUnknown(schema)(request.params) as Effect.Effect<
      Schema.Schema.Type<S>,
      ParseError,
      Schema.Schema.Context<S>
    >;

/**
 * Encode output with a schema and send as JSON response.
 *
 * @example
 * ```ts
 * const handler = (request: Request, response: Response) =>
 *   pipe(
 *     fetchData(),
 *     Effect.andThen(sendJson(response, MyOutputSchema, 200))
 *   );
 * ```
 */
export const sendJson =
  <S extends Schema.Schema.Any>(response: Response, schema: S, status = 200) =>
  (
    output: Schema.Schema.Type<S>
  ): Effect.Effect<void, ParseError, Schema.Schema.Context<S>> =>
    pipe(
      Schema.encodeUnknown(schema)(output) as Effect.Effect<
        Schema.Schema.Encoded<S>,
        ParseError,
        Schema.Schema.Context<S>
      >,
      Effect.andThen((encoded) =>
        Effect.sync(() => {
          response.status(status).json(encoded);
        })
      )
    );

/**
 * Send a JSON response without schema encoding.
 *
 * @example
 * ```ts
 * const handler = (request: Request, response: Response) =>
 *   pipe(
 *     fetchData(),
 *     Effect.andThen(sendJsonRaw(response, 200))
 *   );
 * ```
 */
export const sendJsonRaw =
  (response: Response, status = 200) =>
  <T>(output: T): Effect.Effect<void> =>
    Effect.sync(() => {
      response.status(status).json(output);
    });

/**
 * Compose body parsing and JSON response encoding around a handler.
 *
 * @example
 * ```ts
 * const handler = withBodyAndResponse(BodySchema, ResponseSchema)(
 *   (body, request) =>
 *     Effect.gen(function* () {
 *       return yield* processBody(body);
 *     })
 * );
 *
 * export const myFunction = onRequestEffect(
 *   { runtime },
 *   (request, response) =>
 *     pipe(handler(request, response), Effect.andThen(sendJson(response, ResponseSchema)))
 * );
 * ```
 */
export const withBodySchema =
  <B extends Schema.Schema.Any>(bodySchema: B) =>
  <R, E, T>(
    handler: (
      body: Schema.Schema.Type<B>,
      request: Request
    ) => Effect.Effect<T, E, R>
  ) =>
  (
    request: Request
  ): Effect.Effect<T, E | ParseError, R | Schema.Schema.Context<B>> =>
    pipe(
      parseBody(bodySchema)(request),
      Effect.andThen((body) => handler(body, request))
    );

/**
 * Compose body parsing, handler, and JSON response sending.
 *
 * @example
 * ```ts
 * export const createPost = onRequestEffect(
 *   { runtime },
 *   withJsonEndpoint(CreatePostBody, PostResponse)(
 *     (body, request, response) =>
 *       Effect.gen(function* () {
 *         const post = yield* createPost(body);
 *         return post; // Will be encoded and sent as JSON
 *       })
 *   )
 * );
 * ```
 */
export const withJsonEndpoint =
  <B extends Schema.Schema.Any, O extends Schema.Schema.Any>(
    bodySchema: B,
    responseSchema: O,
    successStatus = 200
  ) =>
  <R, E>(
    handler: (
      body: Schema.Schema.Type<B>,
      request: Request,
      response: Response
    ) => Effect.Effect<Schema.Schema.Type<O>, E, R>
  ) =>
  (
    request: Request,
    response: Response
  ): Effect.Effect<
    void,
    E | ParseError,
    R | Schema.Schema.Context<B> | Schema.Schema.Context<O>
  > =>
    pipe(
      parseBody(bodySchema)(request),
      Effect.andThen((body) => handler(body, request, response)),
      Effect.andThen(sendJson(response, responseSchema, successStatus))
    );
