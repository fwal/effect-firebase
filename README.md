# Effect Firebase

Firebase integration for [Effect](https://effect.website). Provides schemas, models, repositories, and Cloud Functions helpers built on Effect's type system.

[![npm version](https://badgen.net/npm/v/effect-firebase/beta)](https://www.npmjs.com/package/effect-firebase)
[![Effect: v4](https://badgen.net/static/effect/v4/orange?icon=effect)](https://effect.website)
[![License: MIT](https://badgen.net/github/license/fwal/effect-firebase)](https://opensource.org/licenses/MIT)

> [!WARNING]
> Main contains the beta for 1.0, currently in active development.

## Packages

| Package                                       | Description                             |
| --------------------------------------------- | --------------------------------------- |
| [effect-firebase](./packages/effect-firebase) | Core schemas, models, and query builder |
| [@effect-firebase/admin](./packages/admin)    | Firebase Admin SDK + Cloud Functions    |
| [@effect-firebase/client](./packages/client)  | Firebase Client SDK                     |
| [@effect-firebase/mock](./packages/mock)      | In-memory mock for testing              |

## Installation

```bash
npm install effect-firebase effect

# Pick one or more SDK packages:
npm install @effect-firebase/admin firebase-admin firebase-functions
npm install @effect-firebase/client firebase
npm install --save-dev @effect-firebase/mock
```

## Usage

### Define a model

```typescript
import { Schema } from 'effect';
import { Model } from 'effect-firebase';

const PostId = Schema.String.pipe(Schema.brand('PostId'));
const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));

class PostModel extends Model.Class<PostModel>('PostModel')({
  id: Model.GeneratedByDb(PostId),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
  author: Model.Reference(AuthorId, 'authors'),
  title: Schema.String,
  content: Schema.String,
  status: Schema.Literal('draft', 'published'),
}) {}
```

### Create a repository

```typescript
import { Effect } from 'effect';
import { Model, Query } from 'effect-firebase';

export const PostRepository = Model.makeRepository(PostModel, {
  collectionPath: 'posts',
  idField: 'id',
  spanPrefix: 'PostRepository',
}).pipe(
  Effect.map((repo) => ({
    ...repo,
    published: () =>
      repo.queryStream(
        Query.and(
          Query.where('status', '==', 'published'),
          Query.orderBy('createdAt', 'desc')
        )
      ),
  }))
);
```

### Client app

```typescript
import { Effect } from 'effect';
import { initializeApp } from 'firebase/app';
import { Client } from '@effect-firebase/client';

const program = Effect.gen(function* () {
  const repo = yield* PostRepository;
  const postId = yield* repo.add({
    title: 'Hello',
    content: '...',
    status: 'draft',
  });
  const posts = yield* repo.query(Query.where('status', '==', 'published'));
  return { postId, posts };
}).pipe(
  Effect.provide(PostRepository),
  Effect.provide(
    Client.layer({ app: initializeApp({ projectId: 'my-project' }) })
  )
);
```

### Transactions and batches

```typescript
import { Effect } from 'effect';
import { Firestore } from 'effect-firebase';

// Atomic read-modify-write across repositories
Firestore.withTransaction(
  Effect.gen(function* () {
    const repo = yield* PostRepository;
    const post = yield* repo.getById(postId);
    yield* repo.update(postId, { status: 'published' });
  })
);

// Stage many writes and commit them atomically
Firestore.withBatch(
  Effect.gen(function* () {
    const repo = yield* PostRepository;
    yield* Effect.forEach(ids, (id) => repo.update(id, { status: 'archived' }));
  })
);
```

### Cloud Function

```typescript
import { Effect, Layer } from 'effect';
import { initializeApp } from 'firebase-admin/app';
import { Admin, FunctionsRuntime, onCallEffect } from '@effect-firebase/admin';

const runtime = FunctionsRuntime.make(
  Layer.mergeAll(Admin.layer({ app: initializeApp() }), PostRepository)
);

export const createPost = onCallEffect({ runtime }, (request) =>
  Effect.gen(function* () {
    const repo = yield* PostRepository;
    const postId = yield* repo.add({
      title: request.data.title,
      content: request.data.content,
      author: AuthorId.make(request.auth!.uid),
      status: 'draft',
    });
    return { postId };
  })
);
```

### Testing

```typescript
import { Effect } from 'effect';
import { layer as mockFirestore } from '@effect-firebase/mock';

await Effect.runPromise(
  Effect.gen(function* () {
    const repo = yield* PostRepository;
    const postId = yield* repo.add({
      title: 'Test',
      content: '...',
      status: 'draft',
    });
    const post = yield* repo.getById(postId);
    expect(post.title).toBe('Test');
  }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore))
);
```

## Cloud Functions

`@effect-firebase/admin` provides Effect wrappers for all major Cloud Functions trigger types:

- `onRequestEffect` — HTTP
- `onCallEffect` — Callable
- `onDocumentCreatedEffect`, `onDocumentUpdatedEffect`, `onDocumentDeletedEffect`, `onDocumentWrittenEffect` — Firestore triggers
- `onMessagePublishedEffect` — Pub/Sub
- `onTaskDispatchedEffect` — Cloud Tasks

## Development

```bash
pnpm install
pnpm nx run-many -t build
pnpm nx run-many -t test
```

The repo includes a full example app with Firebase emulator support:

```bash
pnpm example:emulator   # Terminal 1
pnpm example:hosting    # Terminal 2
```

## License

MIT. The Model/Repository pattern is adapted from [`@effect/sql`](https://github.com/Effect-TS/effect/tree/main/packages/sql).
