# Effect Firebase Functions API Reference

## Table of Contents

1. [Runtime](#runtime)
2. [onCallEffect](#oncalleffect)
3. [onRequestEffect](#onrequesteffect)
4. [Firestore Triggers](#firestore-triggers)
5. [Pub/Sub](#pubsub)
6. [Context Types](#context-types)
7. [Error Handling](#error-handling)

---

## Runtime

### FunctionsRuntime.make

Create a managed runtime for Firebase Functions.

```typescript
function make<R, E>(layer: Layer.Layer<R, E>): ManagedRuntime.ManagedRuntime<R, E>
```

The runtime automatically disposes on SIGINT/SIGTERM.

### FunctionsRuntime.Default

Create a default runtime with FirestoreService.

```typescript
function Default(): ManagedRuntime.ManagedRuntime<FirestoreService, never>
```

---

## onCallEffect

### Signatures

```typescript
// With both input and output schemas
function onCallEffect<R, I extends Schema.Schema.Any, O extends Schema.Schema.Any, E>(
  options: {
    runtime: Runtime<R>;
    inputSchema: I;
    outputSchema: O;
  } & CallableOptions,
  handler: (
    input: Schema.Schema.Type<I>,
    context: CallableContext
  ) => Effect.Effect<Schema.Schema.Type<O>, E, R>
): CallableFunction<Schema.Schema.Encoded<O>, Schema.Schema.Encoded<I>>;

// With only input schema
function onCallEffect<R, T, I extends Schema.Schema.Any, E>(
  options: {
    runtime: Runtime<R>;
    inputSchema: I;
  } & CallableOptions,
  handler: (
    input: Schema.Schema.Type<I>,
    context: CallableContext
  ) => Effect.Effect<T, E, R>
): CallableFunction<T, Schema.Schema.Encoded<I>>;

// With only output schema
function onCallEffect<R, O extends Schema.Schema.Any, E>(
  options: {
    runtime: Runtime<R>;
    outputSchema: O;
  } & CallableOptions,
  handler: (
    request: CallableRequest,
    response?: CallableResponse
  ) => Effect.Effect<Schema.Schema.Type<O>, E, R>
): CallableFunction<Schema.Schema.Encoded<O>, unknown>;

// No schemas (raw access)
function onCallEffect<R, T, E>(
  options: {
    runtime: Runtime<R>;
  } & CallableOptions,
  handler: (
    request: CallableRequest,
    response?: CallableResponse
  ) => Effect.Effect<T, E, R>
): CallableFunction<T, unknown>;
```

### CallableOptions (from firebase-functions)

```typescript
interface CallableOptions {
  region?: string | string[];
  memory?: MemoryOption;
  timeoutSeconds?: number;
  minInstances?: number;
  maxInstances?: number;
  concurrency?: number;
  cors?: string | boolean | RegExp | Array<string | RegExp>;
  enforceAppCheck?: boolean;
  consumeAppCheckToken?: boolean;
}
```

---

## onRequestEffect

### Signatures

```typescript
// With both body and response schemas
function onRequestEffect<R, B extends Schema.Schema.Any, O extends Schema.Schema.Any, E>(
  options: {
    runtime: Runtime<R>;
    bodySchema: B;
    responseSchema: O;
    successStatus?: number;  // Default: 200
  } & HttpsOptions,
  handler: (
    body: Schema.Schema.Type<B>,
    request: Request,
    response: Response
  ) => Effect.Effect<Schema.Schema.Type<O>, E, R>
): HttpsFunction;

// With only body schema
function onRequestEffect<R, B extends Schema.Schema.Any, E>(
  options: {
    runtime: Runtime<R>;
    bodySchema: B;
  } & HttpsOptions,
  handler: (
    body: Schema.Schema.Type<B>,
    request: Request,
    response: Response
  ) => Effect.Effect<void, E, R>
): HttpsFunction;

// With only response schema
function onRequestEffect<R, O extends Schema.Schema.Any, E>(
  options: {
    runtime: Runtime<R>;
    responseSchema: O;
    successStatus?: number;
  } & HttpsOptions,
  handler: (
    request: Request,
    response: Response
  ) => Effect.Effect<Schema.Schema.Type<O>, E, R>
): HttpsFunction;

// No schemas (full control)
function onRequestEffect<R, E>(
  options: {
    runtime: Runtime<R>;
  } & HttpsOptions,
  handler: (
    request: Request,
    response: Response
  ) => Effect.Effect<void, E, R>
): HttpsFunction;
```

### HttpsOptions (from firebase-functions)

```typescript
interface HttpsOptions {
  region?: string | string[];
  memory?: MemoryOption;
  timeoutSeconds?: number;
  minInstances?: number;
  maxInstances?: number;
  concurrency?: number;
  cors?: string | boolean | RegExp | Array<string | RegExp>;
}
```

---

## Firestore Triggers

### onDocumentCreatedEffect

```typescript
function onDocumentCreatedEffect<
  R,
  Document extends string,
  S extends Schema.Schema.Any = Schema.Schema<unknown>,
  IdField extends keyof Schema.Schema.Type<S> & string = never
>(
  options: {
    runtime: Runtime<R | Schema.Schema.Context<S>>;
    document: Document;
    schema?: S;
    idField?: IdField;
  } & DocumentOptions<Document>,
  handler: (
    data: Schema.Schema.Type<S>,
    event: FirestoreEvent<QueryDocumentSnapshot | undefined, ParamsOf<Document>>
  ) => Effect.Effect<void, never, R>
): CloudFunction<FirestoreEvent<QueryDocumentSnapshot | undefined, ParamsOf<Document>>>;
```

### onDocumentUpdatedEffect

```typescript
function onDocumentUpdatedEffect<
  R,
  Document extends string,
  S extends Schema.Schema.Any = Schema.Schema<unknown>,
  IdField extends keyof Schema.Schema.Type<S> & string = never
>(
  options: {
    runtime: Runtime<R | Schema.Schema.Context<S>>;
    document: Document;
    schema?: S;
    idField?: IdField;
  } & DocumentOptions<Document>,
  handler: (
    data: TypedChange<Schema.Schema.Type<S>>,
    event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined, ParamsOf<Document>>
  ) => Effect.Effect<void, never, R>
): CloudFunction<FirestoreEvent<Change<QueryDocumentSnapshot> | undefined, ParamsOf<Document>>>;

interface TypedChange<A> {
  before: A;
  after: A;
}
```

### onDocumentDeletedEffect

```typescript
function onDocumentDeletedEffect<
  R,
  Document extends string,
  S extends Schema.Schema.Any = Schema.Schema<unknown>,
  IdField extends keyof Schema.Schema.Type<S> & string = never
>(
  options: {
    runtime: Runtime<R | Schema.Schema.Context<S>>;
    document: Document;
    schema?: S;
    idField?: IdField;
  } & DocumentOptions<Document>,
  handler: (
    data: Schema.Schema.Type<S>,
    event: FirestoreEvent<QueryDocumentSnapshot | undefined, ParamsOf<Document>>
  ) => Effect.Effect<void, never, R>
): CloudFunction<FirestoreEvent<QueryDocumentSnapshot | undefined, ParamsOf<Document>>>;
```

### onDocumentWrittenEffect

```typescript
function onDocumentWrittenEffect<
  R,
  Document extends string,
  S extends Schema.Schema.Any = Schema.Schema<unknown>,
  IdField extends keyof Schema.Schema.Type<S> & string = never
>(
  options: {
    runtime: Runtime<R | Schema.Schema.Context<S>>;
    document: Document;
    schema?: S;
    idField?: IdField;
  } & DocumentOptions<Document>,
  handler: (
    data: TypedChange<Schema.Schema.Type<S> | undefined>,
    event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined, ParamsOf<Document>>
  ) => Effect.Effect<void, never, R>
): CloudFunction<FirestoreEvent<Change<QueryDocumentSnapshot> | undefined, ParamsOf<Document>>>;
```

### DocumentOptions (from firebase-functions)

```typescript
interface DocumentOptions<Document extends string> {
  document: Document;
  database?: string;
  namespace?: string;
  region?: string;
  memory?: MemoryOption;
  timeoutSeconds?: number;
}
```

### WithAuthContext Variants

All Firestore triggers have `WithAuthContext` variants that include authentication info:

- `onDocumentCreatedWithAuthContextEffect`
- `onDocumentUpdatedWithAuthContextEffect`
- `onDocumentDeletedWithAuthContextEffect`
- `onDocumentWrittenWithAuthContextEffect`

These receive `FirestoreAuthEvent` which includes `event.authType` and `event.authId`.

---

## Pub/Sub

### onMessagePublishedEffect

```typescript
// With message schema
function onMessagePublishedEffect<R, S extends Schema.Schema.Any, E>(
  options: {
    runtime: Runtime<R>;
    topic: string;
    messageSchema: S;
  } & PubSubOptions,
  handler: (
    message: Schema.Schema.Type<S>,
    event: CloudEvent<MessagePublishedData<Schema.Schema.Type<S>>>
  ) => Effect.Effect<void, E, R>
): CloudFunction<CloudEvent<MessagePublishedData<Schema.Schema.Type<S>>>>;

// Without schema (raw access)
function onMessagePublishedEffect<R, T, E>(
  options: {
    runtime: Runtime<R>;
    topic: string;
  } & PubSubOptions,
  handler: (
    event: CloudEvent<MessagePublishedData<T>>
  ) => Effect.Effect<void, E, R>
): CloudFunction<CloudEvent<MessagePublishedData<T>>>;
```

### PubSubOptions (from firebase-functions)

```typescript
interface PubSubOptions {
  topic: string;
  region?: string;
  memory?: MemoryOption;
  timeoutSeconds?: number;
  minInstances?: number;
  maxInstances?: number;
  retry?: boolean;
}
```

---

## Context Types

### CallableContext

Provided to onCallEffect handlers when using inputSchema:

```typescript
interface CallableContext {
  auth?: {
    uid: string;
    token: DecodedIdToken;
  };
  app?: AppCheckData;
  instanceIdToken?: string;
  rawRequest: Request;
}
```

### Event Params

Access path parameters via `event.params`:

```typescript
// document: 'users/{userId}/posts/{postId}'
event.params.userId  // string
event.params.postId  // string
```

---

## Error Handling

### Setup Error Recovery (onSetupError)

Setup errors are failures that happen outside the handler: input/body/document/message/task
data that does not match the provided schema, or handler output that cannot be encoded with
the output schema. They surface as a `FunctionSetupError` with a `phase`
(`decode-input`, `encode-output`, `decode-body`, `encode-response`, `decode-document`,
`decode-message`, `decode-task`) and the underlying `SchemaError` as `cause`.

Every wrapper accepts an `onSetupError` option to recover:

```typescript
// Callable: return a fallback output or fail with an HttpsError
export const myFunction = onCallEffect(
  {
    runtime,
    inputSchema: Input,
    outputSchema: Output,
    onSetupError: (error, request) =>
      Effect.fail(new HttpsError('invalid-argument', `Bad request: ${error.cause.message}`)),
  },
  (input) => handle(input)
);

// HTTP: write your own response
export const api = onRequestEffect(
  {
    runtime,
    bodySchema: Body,
    responseSchema: Out,
    onSetupError: (error, request, response) =>
      Effect.sync(() => response.status(422).json({ error: error.cause.message })),
  },
  (body) => handle(body)
);

// Firestore trigger: e.g. skip malformed documents instead of logging a defect
export const onPostCreated = onDocumentCreatedEffect(
  {
    document: 'posts/{postId}',
    runtime,
    schema: Post,
    onSetupError: (error, event) =>
      Effect.sync(() => logger.warn('Skipping malformed post', { id: event.params.postId })),
  },
  (post) => handle(post)
);
```

Defaults when `onSetupError` is omitted:

- `onCallEffect`: input decode failure → `HttpsError('invalid-argument')`; output encode failure → `HttpsError('internal')`
- `onRequestEffect`: body parse failure → 400 `{ error: 'Invalid request body' }`; response encode failure → 500
- Firestore/Pub/Sub/Tasks triggers: the setup error is treated as a defect and logged

`onCallEffect` also propagates any `HttpsError` failed from the handler or recovery effect
to the client with its code and message intact.

### Automatic Defect Logging

All function wrappers automatically log defects (unhandled errors):

```typescript
logger.error('Defect in onCall', {
  inner: error,
  stack: error instanceof Error ? error.stack : undefined,
});
```

### Manual Error Handling

Use Effect's error handling for recoverable errors:

```typescript
export const myFunction = onCallEffect(
  { runtime, inputSchema: Input, outputSchema: Output },
  (input) =>
    Effect.gen(function* () {
      const result = yield* someOperation(input).pipe(
        Effect.catchTag('NotFoundError', () =>
          Effect.fail(new HttpsError('not-found', 'Resource not found'))
        ),
        Effect.catchTag('ValidationError', (e) =>
          Effect.fail(new HttpsError('invalid-argument', e.message))
        )
      );
      return result;
    })
);
```

### HTTP Error Responses

For onRequestEffect without responseSchema, handle errors manually:

```typescript
export const webhook = onRequestEffect(
  { runtime },
  (request, response) =>
    Effect.gen(function* () {
      const result = yield* process(request.body).pipe(
        Effect.catchAll((e) =>
          Effect.sync(() => {
            response.status(400).json({ error: e.message });
          })
        )
      );
      response.status(200).json(result);
    })
);
```
