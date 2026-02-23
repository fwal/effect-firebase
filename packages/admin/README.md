# @effect-firebase/admin

Firebase Admin SDK integration for Effect Firebase. This package provides the FirestoreService implementation for server-side applications and Cloud Functions support.

> [!WARNING]
> This project is still under heavy development and APIs may change frequently.

## Features

- 🔥 **Firebase Admin SDK Integration** - Complete FirestoreService implementation
- ⚡ **Cloud Functions Support** - Effect-based function handlers
- 📝 **Cloud Logging** - Automatic logging integration
- 🎯 **Type-Safe Function Handlers** - Schema validation for function inputs/outputs
- 🔄 **Firestore Triggers** - Document lifecycle event handlers
- 📮 **Cloud Tasks Triggers** - Typed task queue handlers with optional payload decoding
- 🚀 **Effect Native** - Built on Effect's powerful composition and error handling

## Installation

```bash
npm install @effect-firebase/admin effect-firebase effect @effect/experimental
npm install firebase-admin firebase-functions
```

## Cloud Functions

### HTTP Functions (onRequest)

```typescript
import { Effect } from 'effect';
import { initializeApp } from 'firebase-admin/app';
import {
  Admin,
  FunctionsRuntime,
  onRequestEffect,
} from '@effect-firebase/admin';

// Create the runtime with your layers
const runtime = FunctionsRuntime.make(Admin.layerFromApp(initializeApp()));

// Define the function
export const myHttpFunction = onRequestEffect(
  { runtime },
  (request, response) =>
    Effect.gen(function* () {
      const repo = yield* PostRepository;
      const posts = yield* repo.query();

      response.json({ posts });
    }).pipe(Effect.provide(PostRepository))
);
```

### Callable Functions (onCall)

```typescript
import { Effect, Schema } from 'effect';
import { initializeApp } from 'firebase-admin/app';
import { Admin, FunctionsRuntime, onCallEffect } from '@effect-firebase/admin';

const runtime = FunctionsRuntime.make(Admin.layerFromApp(initializeApp()));

// Define request/response schemas
const CreatePostRequest = Schema.Struct({
  title: Schema.String,
  content: Schema.String,
});

const CreatePostResponse = Schema.Struct({
  postId: Schema.String,
});

// Define the function
export const createPost = onCallEffect(
  {
    runtime,
    inputSchema: CreatePostRequest,
    outputSchema: CreatePostResponse,
  },
  (request) =>
    Effect.gen(function* () {
      const repo = yield* PostRepository;
      const { title, content } = request.data;

      const postId = yield* repo.add({
        title,
        content,
        status: 'draft',
        likes: 0,
      });

      return { postId };
    }).pipe(Effect.provide(PostRepository))
);
```

### Cloud Tasks Functions (onTaskDispatched)

```typescript
import { Effect, Schema } from 'effect';
import { initializeApp } from 'firebase-admin/app';
import {
  Admin,
  FunctionsRuntime,
  onTaskDispatchedEffect,
} from '@effect-firebase/admin';

const runtime = FunctionsRuntime.make(Admin.layerFromApp(initializeApp()));

const ProcessEmailTask = Schema.Struct({
  email: Schema.String,
  template: Schema.String,
});

export const processEmail = onTaskDispatchedEffect(
  {
    runtime,
    retryConfig: { maxAttempts: 5 },
    rateLimits: { maxConcurrentDispatches: 10 },
    dataSchema: ProcessEmailTask,
  },
  (task, request) =>
    Effect.gen(function* () {
      yield* Effect.log('Processing task', {
        email: task.email,
        queue: request.queueName,
      });
    })
);
```

## Cloud Logging

The Admin layer automatically provides Cloud Logging integration:

```typescript
import { Effect } from 'effect';
import { initializeApp } from 'firebase-admin/app';
import { Admin } from '@effect-firebase/admin';

Effect.gen(function* () {
  // Logs automatically go to Cloud Logging
  yield* Effect.log('Info message');
  yield* Effect.logError('Error message');
  yield* Effect.logDebug('Debug message');

  // Logs with structured data
  yield* Effect.log('User action', {
    userId: '123',
    action: 'create_post',
    metadata: { postId: 'abc' },
  });
}).pipe(Effect.provide(Admin.layerFromApp(initializeApp())));
```

## Configuration

### Function Options

All function handlers support Firebase Functions configuration options:

```typescript
import { onCallEffect } from '@effect-firebase/admin';

export const myFunction = onCallEffect(
  {
    runtime,
    // Firebase Functions options
    region: 'us-central1',
    memory: '512MB',
    timeoutSeconds: 60,
    maxInstances: 100,
    minInstances: 0,
    // CORS
    cors: true,
  },
  (request) => /* ... */
);
```

## API Reference

### Admin

- `Admin.layer` - Layer providing FirestoreService and CloudLogger (requires `App` in the environment)
- `Admin.layerFromApp(app)` - Convenience layer with Firebase Admin app already provided

### Functions

- `onRequestEffect` - HTTP request handler
- `onCallEffect` - Callable function handler
- `onDocumentCreatedEffect` - Document created trigger
- `onDocumentUpdatedEffect` - Document updated trigger
- `onDocumentDeletedEffect` - Document deleted trigger
- `onDocumentWrittenEffect` - Document written (any change) trigger
- `onMessagePublishedEffect` - Pub/Sub message published trigger
- `onTaskDispatchedEffect` - Cloud Tasks dispatch trigger
- `FunctionsRuntime.make(layer)` - Create an Effect runtime from a layer
- `FunctionsRuntime.Default(app)` - Create a runtime from the provided Firebase Admin app

## Documentation

For core concepts, schemas, models, and queries, see the [effect-firebase documentation](../effect-firebase/README.md).

## License

MIT

## Resources

- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [Cloud Functions](https://firebase.google.com/docs/functions)
- [Effect Documentation](https://effect.website)
- [Main Repository](https://github.com/fwal/effect-firebase)
