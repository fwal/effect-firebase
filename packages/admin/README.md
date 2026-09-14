# @effect-firebase/admin

Firebase Admin SDK integration for Effect Firebase. Provides a `FirestoreService` implementation and Effect wrappers for Cloud Functions triggers.

> [!WARNING]
> Under heavy development. APIs may change.

## Installation

```bash
npm install @effect-firebase/admin effect-firebase effect
npm install firebase-admin firebase-functions
```

## Setup

Create a runtime from a layer and pass it to function handlers:

```typescript
import { initializeApp } from 'firebase-admin/app';
import { Admin, FunctionsRuntime } from '@effect-firebase/admin';

const runtime = FunctionsRuntime.make(Admin.layer({ app: initializeApp() }));
```

`Admin.layer` accepts `{ app }`, `{ firestore }`, or no arguments (uses/initializes the default app). It provides `FirestoreService` and wires up Cloud Logging.

## Cloud Functions

### HTTP (`onRequest`)

```typescript
import { onRequestEffect } from '@effect-firebase/admin';

export const myFunction = onRequestEffect({ runtime }, (request, response) =>
  Effect.gen(function* () {
    const repo = yield* PostRepository;
    response.json({ posts: yield* repo.query() });
  }).pipe(Effect.provide(PostRepository)),
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
    }).pipe(Effect.provide(PostRepository)),
);
```

When `inputSchema` and `outputSchema` are provided, decoding and encoding are handled automatically.

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
underlying `SchemaError` as `cause`.

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

| Wrapper                        | Invalid incoming data                       | Encode failure       |
| ------------------------------ | ------------------------------------------- | -------------------- |
| `onCallEffect`                 | `HttpsError('invalid-argument', ...)`        | `HttpsError('internal')` |
| `onRequestEffect`              | `400 { error: 'Invalid request body' }`      | `500`                |
| Firestore / Pub/Sub / Tasks    | logged defect                               | —                    |

`onCallEffect` also propagates any `HttpsError` failed by the handler itself to the
client with its code and message intact, so `Effect.catchTag(...)` chains that end in
`Effect.fail(new HttpsError(...))` work as written.

## Cloud Logging

`Admin.layer` automatically replaces the default Effect logger with one that writes structured logs to Cloud Logging:

```typescript
Effect.gen(function* () {
  yield* Effect.log('info message');
  yield* Effect.logError('error message');
  yield* Effect.logDebug('debug message');
}).pipe(Effect.provide(Admin.layer({ app: initializeApp() })));
```

## Troubleshooting

**`Failed to initialize Google Cloud Firestore client with the available credentials`** — usually caused by multiple installed copies of `firebase-admin`. Either deduplicate it (`pnpm why firebase-admin`) or pass a Firestore instance directly:

```typescript
import { getFirestore } from 'firebase-admin/firestore';

const db = getFirestore(initializeApp());
const runtime = FunctionsRuntime.make(Admin.layer({ firestore: db }));
```

## License

MIT
