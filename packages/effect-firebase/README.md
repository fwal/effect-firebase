# effect-firebase

Core library for Effect Firebase. Provides Firestore schemas, a model/repository pattern, and a type-safe query builder. Works with the Admin SDK, the Client SDK and the in-memory mock via a platform-agnostic `FirestoreService` interface.

## Installation

```bash
npm install effect-firebase effect
```

## Models

Define a model with `Model.Class` from `effect/schema`; Firestore-specific field helpers come from the `Firestore` namespace. Each field declares how it behaves across variants: `select` (read), `insert` (create), `update` (partial update), and `json` / `jsonCreate` / `jsonUpdate` (serialization).

```typescript
import { Schema } from 'effect';
import { Model } from 'effect/schema';
import { Firestore } from 'effect-firebase';

const PostId = Schema.String.pipe(Schema.brand('PostId'));
const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));

class PostModel extends Model.Class<PostModel>('PostModel')({
  id: Model.GeneratedByDb(PostId), // excluded from insert and update
  createdAt: Firestore.DateTimeInsert, // set on create, excluded from update
  updatedAt: Firestore.DateTimeUpdate, // set on every write
  author: Firestore.Reference(AuthorId, 'authors'), // stored as DocumentReference
  title: Schema.String,
  content: Schema.String,
  status: Schema.Literals(['draft', 'published']),
  likes: Firestore.Number, // accepts Firestore.increment(n) in update
  tags: Firestore.Array(Schema.String), // accepts arrayUnion/arrayRemove in update
  summary: Firestore.OptionalDeletable(Schema.String), // Option.some(Firestore.delete()) removes it
  metaData: Schema.Struct({ type: Schema.String, deleted: Schema.Boolean }),
}) {}
```

Built-in field helpers (all under `Firestore.` unless noted):

| Helper                                                   | Notes                                                                                                                                                                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Model.GeneratedByDb(s)` / `Model.GeneratedByApp(s)`     | From `effect/schema`. DB-generated ids vs app-generated ids.                                                                                                                                                    |
| `DateTimeInsert`, `DateTimeUpdate`                       | Auto server timestamps. App type is `DateTime.Utc`.                                                                                                                                                             |
| `DateTime`, `ServerDateTime`                             | Plain timestamp; `ServerDateTime` writes server time when the key is omitted or `undefined`.                                                                                                                    |
| `WithServerTimestamp(field)`                             | Lets insert/update accept `Firestore.serverTimestamp()` explicitly.                                                                                                                                             |
| `Reference(id, path)`, `ReferenceOptional(id, path)`     | Typed reference exposed as branded id.                                                                                                                                                                          |
| `ReferenceAsInstance(id, path)`, `ReferencePath(path)`   | Expose `FirestoreSchema.Reference` instance / full path string.                                                                                                                                                 |
| `AnyIdReference`, `AnyPathReference`                     | Untyped references. `AnyIdReference` is read-only (id string on `select`/JSON; omitted from insert/update — a bare id has no collection path). Use `AnyPathReference` for untyped references you need to write. |
| `Optional(s)`, `OptionalNull(s)`, `OptionalDeletable(s)` | `Option` in app. `Optional` reads a missing key/null/undefined and writes `null`; `OptionalNull` only null; `OptionalDeletable` omits the key and supports `Option.some(Firestore.delete())` in update.         |
| `Array(s)`, `WithArrayFields(field)`                     | `Firestore.arrayUnion([...])` / `arrayRemove([...])` in update.                                                                                                                                                 |
| `Number`, `WithIncrementField(field)`                    | `Firestore.increment(n)` in update.                                                                                                                                                                             |
| `GeoPoint`                                               | `FirestoreSchema.GeoPoint` instance in app, `{ latitude, longitude }` in JSON.                                                                                                                                  |
| `Model.Field({ select, insert, update, json, ... })`     | Fully custom per-variant schemas (from `effect/schema`).                                                                                                                                                        |

## Repository

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
    published: () => repo.queryStream(Query.where('status', '==', 'published')),
  })),
);
```

Available methods on every repository:

```typescript
repo.add(data); // Effect<PostId>
repo.set(id, { data, variant?, merge? }); // Effect<void> — upsert at a known ID
repo.update(id, data, { merge? }); // Effect<void> — fails 'not-found' if absent
repo.delete(id); // Effect<void>
repo.deleteRecursive(id); // Effect<void> — Admin SDK only
repo.getById(id); // Effect<Option<Post>>
repo.getByIdStream(id); // Stream<Option<Post>>
repo.query(constraints); // Effect<ReadonlyArray<Post>>
repo.queryStream(constraints); // Stream<ReadonlyArray<Post>>
repo.getByQuery(constraints); // Effect<Option<Post>>
repo.getByQueryStream(constraints); // Stream<Option<Post>>
repo.group.query(constraints); // same four query methods over the collection group
```

All methods fail with `Firestore.ModelError = FirestoreError | UnknownError | NoSuchElementError | SchemaError` (exported as a type alias for use in your own signatures).

### Collection groups

Every repository has a `group` view with the same four query methods, run over the **collection group** with the repository's collection ID (the last segment of `collectionPath`) — `posts/{postId}/comments` and `users/{userId}/comments` are both part of the `comments` group. Set `pathField` to have every read fill in the document's full path.

```typescript
class CommentModel extends Model.Class<CommentModel>('CommentModel')({
  id: Model.GeneratedByDb(CommentId),
  path: Model.GeneratedByDb(Schema.String),
  body: Schema.String,
  createdAt: Firestore.DateTimeInsert,
}) {}

export const CommentRepository = (postId: string) =>
  Firestore.makeRepository(CommentModel, {
    collectionPath: `posts/${postId}/comments`,
    idField: 'id',
    pathField: 'path',
    spanPrefix: 'CommentRepository',
  });

const program = Effect.gen(function* () {
  const repo = yield* CommentRepository('p1');
  const onPost = yield* repo.query(Query.orderBy('createdAt', 'desc'));
  const everywhere = yield* repo.group.query(
    Query.orderBy('createdAt', 'desc'),
  );
});
```

The underlying service methods are `FirestoreService.queryGroup` and `streamQueryGroup`. Firestore needs a collection-group index for the fields a group query filters or orders on.

## Writes

```typescript
// Sentinels — only accepted on fields declared with the matching helper
yield *
  repo.update(id, {
    likes: Firestore.increment(1),
    tags: Firestore.arrayUnion(['effect']),
    summary: Option.some(Firestore.delete()),
  });

// Nested fields: a dotted key touches only that field
yield * repo.update(id, { 'metaData.deleted': true });
// { merge: true } takes a deep partial and flattens it into dotted paths
yield * repo.update(id, { metaData: { deleted: true } }, { merge: true });
```

`set(id, { data, variant })` upserts at a known ID. With `variant: 'insert'` (the default) `DateTimeInsert` fields are re-stamped on every write; with `variant: 'update'` they are omitted (and preserved with `merge: true`). Keys the model does not declare fail with `SchemaError`; they are never silently dropped.

## Queries

```typescript
import { pipe } from 'effect';
import { Query } from 'effect-firebase';

repo.query(
  Query.and(
    Query.where('status', '==', 'published'),
    Query.where('likes', '>=', 10),
    Query.where('metaData.type', '==', 'post'), // dotted paths into nested maps
    Query.orderBy('createdAt', 'desc'),
    Query.limit(20),
  ),
);

repo.query(
  Query.or(
    Query.where('status', '==', 'published'),
    Query.where('status', '==', 'draft'),
  ),
);

// Pipeable form + cursor pagination with a document ID tiebreaker, so pages
// never skip or repeat documents when the order field has duplicate values
repo.query(
  pipe(
    Query.orderBy<typeof PostModel, 'createdAt'>('createdAt', 'desc'),
    Query.addOrderByDocumentId('desc'),
    Query.addStartAfter(lastPost.createdAt, lastPost.id),
    Query.addLimit(20),
  ),
);
```

Constructors: `where`, `orderBy`, `orderByDocumentId`, `limit`, `limitToLast`, `startAt`, `startAfter`, `endAt`, `endBefore`, `and`, `or`, `empty`, plus `add*` pipeable variants. Field names (including dotted paths into nested maps) are checked against the model at compile time.

## Transactions and batches

`Firestore.withTransaction` runs an effect inside a Firestore transaction. Every read and write performed by the effect — including through repositories — is routed through the transaction and committed atomically:

```typescript
import { Effect } from 'effect';
import { Firestore } from 'effect-firebase';

Firestore.withTransaction(
  Effect.gen(function* () {
    const repo = yield* PostRepository;
    const post = yield* repo.getById(postId); // transactional read
    // ... all reads must happen before the first write
    yield* repo.update(postId, { likes: Firestore.increment(1) }); // transactional write
  }),
);
```

- The SDK retries the transaction on contention, so the effect may run more than once.
- Firestore requires all transactional reads to happen before the first write.
- Nested `withTransaction` calls join the ambient transaction.
- `streamDoc`, `streamQuery`, `streamQueryGroup`, and `deleteRecursive` die (defect) inside a transaction; the client SDK additionally disallows `query` and `queryGroup`.

`Firestore.withBatch` stages writes on a write batch and commits them atomically when the effect succeeds. When the effect fails, nothing is committed:

```typescript
Firestore.withBatch(
  Effect.gen(function* () {
    const repo = yield* PostRepository;
    yield* Effect.forEach(ids, (id) =>
      repo.update(id, { status: 'published' }),
    );
  }),
);
```

Batches are write-only: reads inside the effect execute immediately against the database and do not see the staged writes. A batch supports at most 500 writes. Nested `withBatch` calls join the ambient batch; `withTransaction` and `deleteRecursive` inside a batch die.

## Schemas

`FirestoreSchema` exports platform-agnostic schemas for Firestore types:

```typescript
import { FirestoreSchema } from 'effect-firebase';

FirestoreSchema.Timestamp; // { seconds, nanoseconds }
FirestoreSchema.ServerTimestamp; // sentinel for FieldValue.serverTimestamp()
FirestoreSchema.GeoPoint; // { latitude, longitude }
FirestoreSchema.Reference; // { id, path, parent? }; Reference.makeFromPath(path)
```

Each has an `*Instance` variant (`TimestampInstance`, `GeoPointInstance`, …) that keeps the class instance through encoding, for use on the database side. `TimestampDateTimeUtc` converts between Firestore timestamps and `DateTime.Utc`.

## Error handling

```typescript
repo.getById(id).pipe(
  Effect.catchTag('SchemaError', (e) =>
    Effect.fail(new AppError({ cause: e })),
  ),
  Effect.catchTag('FirestoreError', (e) =>
    Effect.fail(new AppError({ cause: e })),
  ),
);
```

## Path validation

`validateDocPath(path)` and `validateCollectionPath(path)` validate a full
document or collection path and return `undefined` when it is well-formed, or a
failure message otherwise. The Admin, Client and mock `FirestoreService` layers
use them to surface wrong-parity paths as a typed `FirestoreError` (`code: 'invalid-argument'`) instead of a defect or a stalled stream.

```typescript
import { validateDocPath, validateCollectionPath } from 'effect-firebase';

validateDocPath('posts/1/comments'); // -> error message (odd segment count)
validateCollectionPath('posts'); // -> undefined
```

The same module exports `validateCollectionId` (a single collection-group
segment) and `collectionIdOf` (the final segment of a collection path).

## Migration and agent guides

This package ships [`MIGRATION.md`](./MIGRATION.md) (v0.x → v1.0) and [`AGENTS.md`](./AGENTS.md) (condensed usage reference for coding agents). Both are available in `node_modules/effect-firebase/` after installing.

## License

MIT. The Model/Repository pattern is adapted from [`@effect/sql`](https://github.com/Effect-TS/effect/tree/main/packages/sql).
