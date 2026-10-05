# @effect-firebase/admin

Firebase Admin SDK integration for Effect Firebase. Provides a `FirestoreService` implementation and Effect wrappers for Cloud Functions triggers.

## Installation

```bash
npm install @effect-firebase/admin effect-firebase effect
npm install firebase-admin firebase-functions express
```

## Setup

Create a runtime from a layer and pass it to function handlers:

```typescript
import { initializeApp } from 'firebase-admin/app';
import { Admin, FunctionsRuntime } from '@effect-firebase/admin';

const runtime = FunctionsRuntime.make(Admin.layer({ app: initializeApp() }));
```

`Admin.layer` accepts `{ app }`, `{ firestore }`, or no arguments (uses/initializes the default app). It provides `FirestoreService` and wires up Cloud Logging. `FunctionsRuntime.Default(app?)` is a shorthand for `make(Admin.layer(...))`. `make` disposes the runtime on `SIGINT`/`SIGTERM`.

Repositories are effects that only need `FirestoreService`, so `yield* PostRepository` inside a handler works without providing anything else.

## Cloud Functions

### HTTP (`onRequest`)

```typescript
import { onRequestEffect } from '@effect-firebase/admin';
import { Query } from 'effect-firebase';

export const myFunction = onRequestEffect({ runtime }, (request, response) =>
  Effect.gen(function* () {
    const repo = yield* PostRepository;
    response.json({ posts: yield* repo.query(Query.limit(20)) });
  }),
);
```

### Callable (`onCall`)

```typescript
import { onCallEffect } from '@effect-firebase/admin';
import { Schema } from 'effect';

const Input = Schema.Struct({ title: Schema.String, content: Schema.String });
const Output = Schema.Struct({ postId: Schema.String });

export const createPost = onCallEffect(
  { runtime, inputSchema: Input, outputSchema: Output },
  (input) =>
    Effect.gen(function* () {
      const repo = yield* PostRepository;
      const postId = yield* repo.add({ ...input, status: 'draft' });
      return { postId };
    }),
);
```

When `inputSchema` and `outputSchema` are provided, decoding and encoding are handled automatically.

When `inputSchema` is set, the handler receives `(input, context)`; `context` exposes `auth`, `app`, `rawRequest`, `instanceIdToken`, `acceptsStreaming` and, when the
client called `httpsCallable(...).stream()`, the `response` object for manual `sendChunk` calls. Without `inputSchema`, the handler receives the raw `(request, response)`.

`onRequestEffect` takes the same approach: with `bodySchema` the handler receives `(body, request, response)`; with `responseSchema` it returns the value to encode and send (status `successStatus`, default `200`).

### Streaming callable (`onCall` + `sendChunk`)

`onCallStreamEffect` takes a handler that returns a `Stream`. Each element is encoded with
`chunkSchema` and sent to the client with `response.sendChunk` as it is produced. When the
stream completes, the collected chunks are returned as the callable's final `data`, so a
client that calls the function without `.stream()` still gets the full result. The stream is
interrupted when the client disconnects, including an in-flight pull.

```typescript
import { onCallStreamEffect } from '@effect-firebase/admin';
import { Schema, Stream } from 'effect';
import { LanguageModel } from 'effect/ai';

export const chat = onCallStreamEffect(
  {
    runtime,
    timeoutSeconds: 540,
    inputSchema: Schema.Struct({ prompt: Schema.String }),
    chunkSchema: Schema.Struct({ delta: Schema.String }),
  },
  (input) =>
    LanguageModel.streamText({ prompt: input.prompt }).pipe(
      Stream.filter((part) => part.type === 'text-delta'),
      Stream.map((part) => ({ delta: part.delta })),
      Stream.provide(AnthropicModel), // any Effect AI provider layer
    ),
);
```

Client side:

```typescript
const { stream, data } = await httpsCallable(functions, 'chat').stream({
  prompt,
});
for await (const chunk of stream) append(chunk.delta);
const allChunks = await data; // ReadonlyArray<{ delta: string }>
```

Streaming callables require 2nd gen Cloud Functions; set `timeoutSeconds` high enough for
long-running generations.

#### Testing callables

`CallableFunction.stream()` in firebase-functions is still a stub, so `@effect-firebase/admin`
ships test helpers that invoke a callable with a fake `CallableResponse`:

```typescript
import {
  runCallable,
  streamCallable,
  makeCallableRequest,
} from '@effect-firebase/admin';

const { stream, data, abort } = streamCallable(chat, { prompt: 'hi' });
for await (const chunk of stream) chunks.push(chunk); // what the client would see
expect(await data).toEqual(chunks); // final `data`
abort(); // simulate a client disconnect

await runCallable(chat, { prompt: 'hi' }); // non-streaming client, final `data` only

// full control over auth/app/rawRequest
streamCallable(
  chat,
  makeCallableRequest(
    { prompt: 'hi' },
    { auth: { uid: 'u1', token, rawToken: 'test-token' } },
  ),
);
```

### Firestore triggers

```typescript
import {
  onDocumentCreatedEffect,
  onDocumentUpdatedEffect,
  onDocumentDeletedEffect,
  onDocumentWrittenEffect,
} from '@effect-firebase/admin';

export const onPostCreated = onDocumentCreatedEffect(
  { runtime, document: 'posts/{postId}', schema: PostModel, idField: 'id' },
  (post) => Effect.log(`Created: ${post.id}`),
);
```

Firestore trigger handlers must return `Effect<void, never, R>`: handle or log every failure yourself. `onDocumentUpdatedEffect` passes a `TypedChange<A>` (`{ before, after }`), `onDocumentWrittenEffect` a `TypedWrittenChange<A>` (`{ before: Option<A>, after: Option<A> }`). Each trigger also has a `...WithAuthContextEffect` variant (e.g. `onDocumentCreatedWithAuthContextEffect`) whose handler receives `(event, data)`.

### Pub/Sub (`onMessagePublished`)

```typescript
import { onMessagePublishedEffect } from '@effect-firebase/admin';

const MessageSchema = Schema.Struct({ userId: Schema.String });

export const onMessage = onMessagePublishedEffect(
  { runtime, topic: 'my-topic', messageSchema: MessageSchema },
  (message) => Effect.log(`Received for user: ${message.userId}`),
);
```

### Cloud Tasks (`onTaskDispatched`)

```typescript
import { onTaskDispatchedEffect } from '@effect-firebase/admin';

const TaskSchema = Schema.Struct({ email: Schema.String });

export const processEmail = onTaskDispatchedEffect(
  { runtime, retryConfig: { maxAttempts: 5 }, schema: TaskSchema },
  (task) => Effect.log(`Sending to: ${task.email}`),
);
```

### Scheduled (`onSchedule`)

```typescript
import { onScheduleEffect } from '@effect-firebase/admin';

export const cleanup = onScheduleEffect(
  { runtime, schedule: 'every 24 hours' },
  (event) => Effect.log(`Running cleanup job: ${event.jobName}`),
);
```

## Setup errors (`onSetupError`)

Every wrapper decodes incoming data and encodes outgoing data with the schemas you
declare. When that fails — the caller sent data that does not match `inputSchema`, a
document does not match `schema` — the wrapper raises a `FunctionSetupError` carrying
the `phase` that failed (`decode-input`, `encode-output`, `decode-body`,
`encode-response`, `decode-document`, `decode-message`, `decode-task`) and the
underlying failure as `cause` (usually a `SchemaError`; a plain `Error` when a Pub/Sub
payload is not valid JSON). `FunctionSetupError` and `isFunctionSetupError` are exported.

Pass `onSetupError` to recover instead of taking the default:

```typescript
import { onCallEffect } from '@effect-firebase/admin';
import { HttpsError } from 'firebase-functions/https';

export const createPost = onCallEffect(
  {
    runtime,
    inputSchema: Input,
    outputSchema: Output,
    onSetupError: (error, request) =>
      Effect.fail(new HttpsError('invalid-argument', error.cause.message)),
  },
  (input, context) => handle(input, context),
);
```

The hook receives the wrapper's native arguments, so an HTTP handler can write its own
response and a trigger can inspect the event:

```typescript
export const onPostCreated = onDocumentCreatedEffect(
  {
    runtime,
    document: 'posts/{postId}',
    schema: PostModel,
    onSetupError: (error, event) =>
      Effect.logWarning(`Skipping malformed post ${event.params.postId}`),
  },
  (post) => handle(post),
);
```

Defaults when `onSetupError` is omitted:

| Wrapper              | Invalid incoming data                   | Encode failure           |
| -------------------- | --------------------------------------- | ------------------------ |
| `onCallEffect`       | `HttpsError('invalid-argument', ...)`   | `HttpsError('internal')` |
| `onCallStreamEffect` | `HttpsError('invalid-argument', ...)`   | `HttpsError('internal')` |
| `onRequestEffect`    | `400 { error: 'Invalid request body' }` | `500`                    |
| Firestore / Pub/Sub  | logged defect (no retry)                | —                        |
| Tasks                | logged defect, rethrown (retried)       | —                        |

`onCallStreamEffect` does not expose an `onSetupError` option, so its row above is unconditional; the other wrappers let `onSetupError` override these defaults.

`onCallEffect` and `onCallStreamEffect` also propagate any `HttpsError` failed by the handler itself to the
client with its code and message intact, so `Effect.catchTag(...)` chains that end in
`Effect.fail(new HttpsError(...))` work as written.

Recovery wraps the boundary only. An error your handler raises is never routed through
`onSetupError` — including a `FunctionSetupError` you raise yourself — so the two stay
distinguishable.

### Expected rejections and defect logging

In `onCallEffect`, `onCallStreamEffect` and `onRequestEffect`, an error that escapes the
handler is logged as a defect unless it is an expected rejection: an `HttpsError`, or any
error annotated with Effect's `ErrorReporter.ignore` (the convention
`HttpApiError.BadRequest` and friends use). `onRequestEffect` still responds `500`; only
the log line is skipped. Trigger wrappers (Firestore, Pub/Sub, Tasks, Schedule) log every
escaping error. Task and scheduled handlers rethrow after logging, so their retry
configuration applies. Annotate your own errors to keep them out of the defect logs while
still failing the call:

```typescript
import { Data, ErrorReporter } from 'effect';

class RejectedError extends Data.TaggedError('RejectedError')<{
  readonly reason: string;
}> {
  readonly [ErrorReporter.ignore] = true;
}
```

## Cloud Logging

`Admin.layer` automatically replaces the default Effect logger with one that writes structured logs to Cloud Logging:

```typescript
Effect.gen(function* () {
  yield* Effect.log('info message');
  yield* Effect.logError('error message');
}).pipe(Effect.provide(Admin.layer({ app: initializeApp() })));
```

The logger is also available on its own as the `Logger.cloudConsole` layer.

## Troubleshooting

**`Failed to initialize Google Cloud Firestore client with the available credentials`** — usually caused by multiple installed copies of `firebase-admin`. Either deduplicate it (`pnpm why firebase-admin`) or pass a Firestore instance directly:

```typescript
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore(initializeApp());
const runtime = FunctionsRuntime.make(Admin.layer({ firestore: db }));
```

## License

MIT
