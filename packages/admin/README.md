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
import { onRequestEffect, makeRuntime } from '@effect-firebase/admin';
import { Admin } from '@effect-firebase/admin';

// Create the runtime with your layers
const runtime = makeRuntime(Admin.layer);

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
import { onCallEffect, makeRuntime } from '@effect-firebase/admin';
import { Admin } from '@effect-firebase/admin';

const runtime = makeRuntime(Admin.layer);

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

## Cloud Logging

The Admin layer automatically provides Cloud Logging integration:

```typescript
import { Effect } from 'effect';

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
}).pipe(Effect.provide(Admin.layer));
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

- `Admin.layer` - Layer providing FirestoreService and CloudLogger

### Functions

- `onRequestEffect` - HTTP request handler
- `onCallEffect` - Callable function handler
- `onDocumentCreatedEffect` - Document created trigger
- `onDocumentUpdatedEffect` - Document updated trigger
- `onDocumentDeletedEffect` - Document deleted trigger
- `onDocumentWrittenEffect` - Document written (any change) trigger
- `makeRuntime` - Create an Effect runtime for functions

## Requirements

- effect ^3.19.8
- effect-firebase ^0.4.0
- firebase-admin ^13.4.0
- firebase-functions ^6.4.0

## Documentation

For core concepts, schemas, models, and queries, see the [effect-firebase documentation](../effect-firebase/README.md).

## License

MIT

## Resources

- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [Cloud Functions](https://firebase.google.com/docs/functions)
- [Effect Documentation](https://effect.website)
- [Main Repository](https://github.com/fwal/effect-firebase)
