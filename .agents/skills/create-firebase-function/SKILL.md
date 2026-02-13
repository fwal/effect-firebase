---
name: effect-firebase-function
description: |
  Create Firebase Cloud Functions using effect-firebase library with type-safe Effect patterns.
  Use when: (1) Creating callable functions (onCallEffect), (2) Creating HTTP endpoints (onRequestEffect),
  (3) Creating Firestore triggers (onDocumentCreated/Updated/Deleted/Written), (4) Creating Pub/Sub handlers (onMessagePublishedEffect),
  (5) Setting up function runtime, (6) Adding schema validation to functions.
---

# Effect Firebase Functions

Create type-safe Firebase Cloud Functions using the effect-firebase library.

## Setup

Create a shared runtime for all functions:

```typescript
// src/runtime.ts
import { initializeApp } from 'firebase-admin/app';
import { FunctionsRuntime, Admin } from '@effect-firebase/admin';

export const runtime = FunctionsRuntime.make(Admin.layerFromApp(initializeApp()));
```

For custom layers (e.g., with repositories):

```typescript
import { initializeApp } from 'firebase-admin/app';
import { FunctionsRuntime, Admin } from '@effect-firebase/admin';
import { Layer } from 'effect';
import { PostRepository } from './repositories/post.js';

const AppLayer = Layer.mergeAll(
  Admin.layerFromApp(initializeApp()),
  PostRepository.Default
);

export const runtime = FunctionsRuntime.make(AppLayer);
```

## Function Types

### Callable Function (onCallEffect)

Client-callable functions with schema validation:

```typescript
import { Effect, Schema } from 'effect';
import { onCallEffect } from '@effect-firebase/admin';
import { runtime } from './runtime.js';

// Define schemas
const CreatePostInput = Schema.Struct({
  title: Schema.String,
  content: Schema.String,
});

const CreatePostOutput = Schema.Struct({
  postId: Schema.String,
});

export const createPost = onCallEffect(
  {
    runtime,
    inputSchema: CreatePostInput,
    outputSchema: CreatePostOutput,
  },
  (input, context) =>
    Effect.gen(function* () {
      // context.auth contains user auth info
      const repo = yield* PostRepository;
      const postId = yield* repo.add({
        title: input.title,
        content: input.content,
        authorId: context.auth?.uid,
      });
      return { postId };
    })
);
```

Without schemas (raw access):

```typescript
export const rawFunction = onCallEffect(
  { runtime },
  (request, response) =>
    Effect.gen(function* () {
      // request.data, request.auth available
      return { success: true };
    })
);
```

### HTTP Endpoint (onRequestEffect)

REST API endpoints:

```typescript
import { onRequestEffect } from '@effect-firebase/admin';

const RequestBody = Schema.Struct({
  email: Schema.String,
});

const ResponseData = Schema.Struct({
  userId: Schema.String,
  created: Schema.Boolean,
});

export const createUser = onRequestEffect(
  {
    runtime,
    bodySchema: RequestBody,
    responseSchema: ResponseData,
    successStatus: 201,
  },
  (body, request, response) =>
    Effect.gen(function* () {
      // body is validated, response auto-sent
      return { userId: '123', created: true };
    })
);
```

Without schemas (full control):

```typescript
export const webhook = onRequestEffect(
  { runtime },
  (request, response) =>
    Effect.gen(function* () {
      response.status(200).json({ received: true });
    })
);
```

### Firestore Triggers

#### Document Created

```typescript
import { onDocumentCreatedEffect } from '@effect-firebase/admin';

export const onPostCreated = onDocumentCreatedEffect(
  {
    runtime,
    document: 'posts/{postId}',
    schema: PostModel.schemas.get,  // Optional: type the data
    idField: 'id',                  // Optional: inject doc ID
  },
  (data, event) =>
    Effect.gen(function* () {
      // data is typed as PostModel
      // event.params.postId available
      yield* Effect.log(`Post created: ${data.title}`);
    })
);
```

#### Document Updated

```typescript
import { onDocumentUpdatedEffect } from '@effect-firebase/admin';

export const onPostUpdated = onDocumentUpdatedEffect(
  {
    runtime,
    document: 'posts/{postId}',
    schema: PostModel.schemas.get,
    idField: 'id',
  },
  (change, event) =>
    Effect.gen(function* () {
      // change.before and change.after are typed
      if (change.before.status !== change.after.status) {
        yield* Effect.log(`Status changed to ${change.after.status}`);
      }
    })
);
```

#### Document Deleted

```typescript
import { onDocumentDeletedEffect } from '@effect-firebase/admin';

export const onPostDeleted = onDocumentDeletedEffect(
  {
    runtime,
    document: 'posts/{postId}',
  },
  (data, event) =>
    Effect.gen(function* () {
      yield* Effect.log(`Post deleted: ${event.params.postId}`);
    })
);
```

#### Document Written (create, update, or delete)

```typescript
import { onDocumentWrittenEffect } from '@effect-firebase/admin';

export const onPostWritten = onDocumentWrittenEffect(
  {
    runtime,
    document: 'posts/{postId}',
  },
  (change, event) =>
    Effect.gen(function* () {
      // change.before is undefined on create
      // change.after is undefined on delete
    })
);
```

### Pub/Sub Handler

```typescript
import { onMessagePublishedEffect } from '@effect-firebase/admin';

const NotificationMessage = Schema.Struct({
  userId: Schema.String,
  message: Schema.String,
});

export const handleNotification = onMessagePublishedEffect(
  {
    runtime,
    topic: 'notifications',
    messageSchema: NotificationMessage,
  },
  (message, event) =>
    Effect.gen(function* () {
      // message is typed as NotificationMessage
      yield* Effect.log(`Sending to ${message.userId}: ${message.message}`);
    })
);
```

## Best Practices

1. **Single runtime**: Share one runtime across all functions
2. **Schema validation**: Always use input/output schemas for callables
3. **Typed triggers**: Use schema + idField for Firestore triggers
4. **Error handling**: Defects are logged automatically; use Effect.catchTag for recoverable errors
5. **Layer composition**: Add repositories and services to your layer

## File Organization

```
functions/
├── src/
│   ├── runtime.ts           # Shared runtime
│   ├── index.ts             # Export all functions
│   ├── callable/
│   │   └── create-post.ts
│   ├── http/
│   │   └── webhook.ts
│   ├── triggers/
│   │   ├── on-post-created.ts
│   │   └── on-user-updated.ts
│   └── pubsub/
│       └── notifications.ts
```

For detailed API reference, see [references/api_reference.md](references/api_reference.md).
