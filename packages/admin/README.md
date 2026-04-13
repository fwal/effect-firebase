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
  }).pipe(Effect.provide(PostRepository))
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
  (request) =>
    Effect.gen(function* () {
      const repo = yield* PostRepository;
      const postId = yield* repo.add({ ...request.data, status: 'draft' });
      return { postId };
    }).pipe(Effect.provide(PostRepository))
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
  (post) => Effect.log(`Created: ${post.id}`)
);
```

### Pub/Sub (`onMessagePublished`)

```typescript
import { onMessagePublishedEffect } from '@effect-firebase/admin';

const MessageSchema = Schema.Struct({ userId: Schema.String });

export const onMessage = onMessagePublishedEffect(
  { runtime, topic: 'my-topic', dataSchema: MessageSchema },
  (message) => Effect.log(`Received for user: ${message.userId}`)
);
```

### Cloud Tasks (`onTaskDispatched`)

```typescript
import { onTaskDispatchedEffect } from '@effect-firebase/admin';

const TaskSchema = Schema.Struct({ email: Schema.String });

export const processEmail = onTaskDispatchedEffect(
  { runtime, retryConfig: { maxAttempts: 5 }, dataSchema: TaskSchema },
  (task) => Effect.log(`Sending to: ${task.email}`)
);
```

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
