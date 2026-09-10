# Effect Firebase

Firebase integration for [Effect](https://effect.website). Provides schemas, models, repositories, and Cloud Functions helpers built on Effect's type system.

[![npm version](https://badgen.net/npm/v/effect-firebase/beta)](https://www.npmjs.com/package/effect-firebase)
[![Effect: v4](https://badgen.net/static/effect/v4/orange?icon=effect)](https://effect.website)
[![License: MIT](https://badgen.net/github/license/fwal/effect-firebase)](https://opensource.org/licenses/MIT)

> [!WARNING]
> Main contains the beta for 1.0, currently in active development.

## Packages

| Package                                          | Description                             |
| ------------------------------------------------ | --------------------------------------- |
| [effect-firebase](./packages/effect-firebase)    | Core schemas, models, and query builder |
| [@effect-firebase/admin](./packages/admin)       | Firebase Admin SDK + Cloud Functions    |
| [@effect-firebase/client](./packages/client)     | Firebase Client SDK                     |
| [@effect-firebase/mock](./packages/mock)         | In-memory mock for testing              |
| [@effect-firebase/devtools](./packages/devtools) | Devtools panel for the mock backend     |

## Guides

- [React patterns](./REACT.md) — atoms, live queries, mutations, forms, and testing from React
- [Migration guide](./packages/effect-firebase/MIGRATION.md) — upgrading from earlier versions (ships in the npm package)
- [Agent guide](./packages/effect-firebase/AGENTS.md) — condensed usage reference for coding agents (ships in the npm package)

## Installation

```bash
npm install effect-firebase effect

# Pick one or more SDK packages:
npm install @effect-firebase/admin firebase-admin firebase-functions
npm install @effect-firebase/client firebase
npm install --save-dev @effect-firebase/mock @effect-firebase/devtools
```

## Usage

### Define a model

```typescript
import { Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import { Firestore } from 'effect-firebase';

const PostId = Schema.String.pipe(Schema.brand('PostId'));
const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));

class PostModel extends Model.Class<PostModel>('PostModel')({
  id: Model.GeneratedByDb(PostId),
  createdAt: Firestore.DateTimeInsert,
  updatedAt: Firestore.DateTimeUpdate,
  author: Firestore.Reference(AuthorId, 'authors'),
  title: Schema.String,
  content: Schema.String,
  status: Schema.Literal('draft', 'published'),
}) {}
```

### Create a repository

```typescript
import { Effect } from 'effect';
import { Firestore, Query } from 'effect-firebase';

export const PostRepository = Firestore.makeRepository(PostModel, {
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
          Query.orderBy('createdAt', 'desc'),
        ),
      ),
  })),
);
```

### Writes at a known ID

`add` lets Firestore pick the ID; `set` writes at an ID the caller already
knows — documents keyed by user UID, external event IDs, join keys.

```typescript
const program = Effect.gen(function* () {
  const repo = yield* PostRepository;

  // Insert-shaped write: stamps createdAt. Replaces the document if it exists.
  yield* repo.set(postId, {
    data: { title: 'Hello', content: '...', status: 'draft' },
  });

  // Update-shaped write, merged: leaves createdAt untouched.
  yield* repo.set(postId, {
    variant: 'update',
    data: { title: 'Hello', content: '...', status: 'draft' },
    merge: true,
  });
});
```

Two things about `set` are worth understanding, because both can lose data
quietly.

**It is nondeterministic.** One call is two operations, chosen by state the
call site cannot see: it inserts when the document is absent and overwrites
every field when it exists, succeeding either way. A `set` meant to create
can replace an existing document instead. Where the intent is fixed, use an
operation that can only do that one thing — `add` always inserts, `update`
always updates and fails `not-found` if the document is absent. To claim a
known ID without clobbering, read and branch inside
`Firestore.withTransaction`; a bare `getById`-then-`set` is a race.

**It has to pick a schema variant before it knows which operation it is.**
That choice decides what happens to insert-only fields — `Firestore.DateTimeInsert`
(`createdAt`) is stamped by `Model.insert` and omitted by `Model.update`:

| `variant`            | payload                               | on an existing document                               |
| -------------------- | ------------------------------------- | ----------------------------------------------------- |
| `'insert'` (default) | includes `createdAt`, freshly stamped | creation time overwritten, `merge` included           |
| `'update'`           | omits `createdAt`                     | `merge: true` preserves it; a full overwrite drops it |

Neither is right in every case, so `set` leaves the call to you: `'insert'`
for a document you expect to be new, `'update'` with `merge: true` for one
you expect to exist. Both are assertions rather than checks — `set` will
not verify which case it is actually in.

### Updating nested fields

`update` accepts Firestore dotted field paths, typed against the model, so a
nested field can change without rewriting its siblings. A whole-field key
replaces the entire map, as in the Firestore SDKs.

```typescript
yield * repo.update(postId, { 'metaData.deleted': true }); // touches only metaData.deleted
yield * repo.update(postId, { metaData: { deleted: true, tags: [] } }); // replaces metaData
yield * repo.update(postId, { 'stats.likes': Firestore.increment(1) }); // nested sentinel
yield * repo.update(postId, { metaData: { deleted: true } }, { merge: true }); // flattened to metaData.deleted
```

With `{ merge: true }` the payload is a deep partial: nested objects are
flattened into dotted paths before the write, so absent siblings are left
untouched. Arrays, `DateTime`, sentinels and other non-plain values are
written whole.

Keys the model does not declare fail with a `SchemaError` naming the key; an
empty payload fails with `FirestoreError` code `invalid-argument`.

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
  const articles = yield* repo.query(
    Query.where('metaData.type', '==', 'article'),
  );
  return { postId, posts };
}).pipe(
  Effect.provide(PostRepository),
  Effect.provide(
    Client.layer({ app: initializeApp({ projectId: 'my-project' }) }),
  ),
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
  }),
);

// Stage many writes and commit them atomically
Firestore.withBatch(
  Effect.gen(function* () {
    const repo = yield* PostRepository;
    yield* Effect.forEach(ids, (id) => repo.update(id, { status: 'archived' }));
  }),
);
```

### Cloud Function

```typescript
import { Effect, Layer } from 'effect';
import { initializeApp } from 'firebase-admin/app';
import { Admin, FunctionsRuntime, onCallEffect } from '@effect-firebase/admin';

const runtime = FunctionsRuntime.make(
  Layer.mergeAll(Admin.layer({ app: initializeApp() }), PostRepository),
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
  }),
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
  }).pipe(Effect.provide(PostRepository), Effect.provide(mockFirestore)),
);
```

## Cloud Functions

`@effect-firebase/admin` provides Effect wrappers for all major Cloud Functions trigger types:

- `onRequestEffect` — HTTP
- `onCallEffect` — Callable
- `onDocumentCreatedEffect`, `onDocumentUpdatedEffect`, `onDocumentDeletedEffect`, `onDocumentWrittenEffect` — Firestore triggers
- `onMessagePublishedEffect` — Pub/Sub
- `onTaskDispatchedEffect` — Cloud Tasks
- `onScheduleEffect` — Cloud Scheduler

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
