import { Effect, pipe, Schema } from 'effect';
import { CallableRequest } from 'firebase-functions/https';
import { ParseError } from 'effect/ParseResult';

/**
 * Metadata from the callable request (auth, raw request, etc.)
 */
export interface CallableContext {
  /** Authentication data from the request */
  auth?: CallableRequest['auth'];
  /** The raw HTTP request */
  rawRequest: CallableRequest['rawRequest'];
  /** App check token data */
  app?: CallableRequest['app'];
  /** Instance ID token */
  instanceIdToken?: string;
}

/**
 * Extract context metadata from a CallableRequest.
 */
export const extractContext = (request: CallableRequest): CallableContext => ({
  auth: request.auth,
  rawRequest: request.rawRequest,
  app: request.app,
  instanceIdToken: request.instanceIdToken,
});

/**
 * Decode the input data from a CallableRequest using a schema.
 *
 * @example
 * ```ts
 * const myHandler = (request: CallableRequest) =>
 *   pipe(
 *     request,
 *     decodeInput(MyInputSchema),
 *     Effect.andThen((input) => processInput(input))
 *   );
 * ```
 */
export const decodeInput =
  <I extends Schema.Schema.Any>(schema: I) =>
  (
    request: CallableRequest
  ): Effect.Effect<
    Schema.Schema.Type<I>,
    ParseError,
    Schema.Schema.Context<I>
  > =>
    Schema.decodeUnknown(schema)(request.data) as Effect.Effect<
      Schema.Schema.Type<I>,
      ParseError,
      Schema.Schema.Context<I>
    >;

/**
 * Encode the output using a schema before returning to the client.
 *
 * @example
 * ```ts
 * const myHandler = (request: CallableRequest) =>
 *   pipe(
 *     processRequest(request),
 *     Effect.andThen(encodeOutput(MyOutputSchema))
 *   );
 * ```
 */
export const encodeOutput =
  <O extends Schema.Schema.Any>(schema: O) =>
  (
    output: Schema.Schema.Type<O>
  ): Effect.Effect<
    Schema.Schema.Encoded<O>,
    ParseError,
    Schema.Schema.Context<O>
  > =>
    Schema.encodeUnknown(schema)(output) as Effect.Effect<
      Schema.Schema.Encoded<O>,
      ParseError,
      Schema.Schema.Context<O>
    >;

/**
 * Compose input decoding and output encoding around a handler.
 * Provides the decoded input and context to the handler, then encodes the output.
 *
 * @example
 * ```ts
 * const myHandler = withSchemas(InputSchema, OutputSchema)(
 *   (input, context) =>
 *     Effect.gen(function* () {
 *       // input is typed as Schema.Type<InputSchema>
 *       // return type must be Schema.Type<OutputSchema>
 *       return yield* processInput(input);
 *     })
 * );
 *
 * export const myFunction = onCall(options, (request) =>
 *   runtime.runPromise(myHandler(request))
 * );
 * ```
 */
export const withSchemas =
  <I extends Schema.Schema.Any, O extends Schema.Schema.Any>(
    inputSchema: I,
    outputSchema: O
  ) =>
  <R, E>(
    handler: (
      input: Schema.Schema.Type<I>,
      context: CallableContext
    ) => Effect.Effect<Schema.Schema.Type<O>, E, R>
  ) =>
  (
    request: CallableRequest
  ): Effect.Effect<
    Schema.Schema.Encoded<O>,
    E | ParseError,
    R | Schema.Schema.Context<I> | Schema.Schema.Context<O>
  > =>
    pipe(
      decodeInput(inputSchema)(request),
      Effect.andThen((input) => handler(input, extractContext(request))),
      Effect.andThen(encodeOutput(outputSchema))
    );

/**
 * Compose only input decoding around a handler.
 * Provides the decoded input and context to the handler.
 *
 * @example
 * ```ts
 * const myHandler = withInputSchema(InputSchema)(
 *   (input, context) =>
 *     Effect.gen(function* () {
 *       // Process and return any type
 *       return { processed: true };
 *     })
 * );
 * ```
 */
export const withInputSchema =
  <I extends Schema.Schema.Any>(inputSchema: I) =>
  <R, E, T>(
    handler: (
      input: Schema.Schema.Type<I>,
      context: CallableContext
    ) => Effect.Effect<T, E, R>
  ) =>
  (
    request: CallableRequest
  ): Effect.Effect<T, E | ParseError, R | Schema.Schema.Context<I>> =>
    pipe(
      decodeInput(inputSchema)(request),
      Effect.andThen((input) => handler(input, extractContext(request)))
    );

/**
 * Compose only output encoding around a handler.
 *
 * @example
 * ```ts
 * const myHandler = withOutputSchema(OutputSchema)(
 *   (request) =>
 *     Effect.gen(function* () {
 *       // Must return Schema.Type<OutputSchema>
 *       return { id: '123', name: 'test' };
 *     })
 * );
 * ```
 */
export const withOutputSchema =
  <O extends Schema.Schema.Any>(outputSchema: O) =>
  <R, E>(
    handler: (
      request: CallableRequest
    ) => Effect.Effect<Schema.Schema.Type<O>, E, R>
  ) =>
  (
    request: CallableRequest
  ): Effect.Effect<
    Schema.Schema.Encoded<O>,
    E | ParseError,
    R | Schema.Schema.Context<O>
  > =>
    pipe(handler(request), Effect.andThen(encodeOutput(outputSchema)));
