# effect-firebase

Core library for Effect Firebase. Provides Firestore schemas, a model/repository pattern, and a type-safe query builder. Works with both the Admin and Client SDKs via a platform-agnostic `FirestoreService` interface.

> [!WARNING]
> Under heavy development. APIs may change.

## Installation

```bash
npm install effect-firebase effect
```

## Models

Define a model with `Model.Class` from `effect/unstable/schema`; Firestore-specific field helpers come from the `Firestore` namespace. Each field declares how it behaves across variants: `select` (read), `insert` (create), `update` (partial update), and `json` / `jsonCreate` / `jsonUpdate` (serialization).

```typescript
import { Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
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
  status: Schema.Literal('draft', 'published'),
}) {}
```

Built-in field helpers:

| Helper                                          | Behaviour                                                       |
| ----------------------------------------------- | --------------------------------------------------------------- |
| `Model.GeneratedByDb(schema)`                   | Auto-generated (e.g. IDs). Excluded from `insert` and `update`. |
| `Firestore.DateTimeInsert`                      | Server timestamp on create. Excluded from `update`.             |
| `Firestore.DateTimeUpdate`                      | Server timestamp on every write.                                |
| `Firestore.Reference(id, collection)`           | Branded ID in app, `DocumentReference` in Firestore.            |
| `Firestore.ReferenceAsInstance(id, collection)` | Same, but exposes `DocumentReference` in the app layer.         |
| `Firestore.OptionalDeletable(schema)`           | Optional field that can be deleted with `Firestore.delete()`.   |
| `Firestore.Array(schema)`                       | Array field. Accepts `arrayUnion`/`arrayRemove` in `update`.    |
| `Firestore.Number`                              | Number field. Accepts `increment(n)` in `update`.               |
| `Firestore.WithIncrementField(field)`           | Adds `increment(n)` support to a number field's `update`.       |
| `Firestore.WithServerTimestamp(field)`          | Adds `serverTimestamp()` support to `insert` and `update`.      |
| `Firestore.GeoPoint`                            | Geographic point with latitude and longitude.                   |
| `Model.Field({ select, insert, update, json })` | Fully custom per-variant schemas.                               |

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
repo.update(id, partial); // Effect<void>
repo.delete(id); // Effect<void>
repo.deleteRecursive(id); // Effect<void> — Admin SDK only
repo.getById(id); // Effect<Option<Post>>
repo.getByIdStream(id); // Stream<Option<Post>>
repo.query(constraints); // Effect<ReadonlyArray<Post>>
repo.queryStream(constraints); // Stream<ReadonlyArray<Post>>
repo.getByQuery(constraints); // Effect<Option<Post>>
repo.getByQueryStream(constraints); // Stream<Option<Post>>
```

All methods fail with `ModelError = FirestoreError | UnknownError | NoSuchElementError | SchemaError`.

## Queries

```typescript
import { pipe } from 'effect';
import { Query } from 'effect-firebase';

Query.where('status', '==', 'published');
Query.orderBy('createdAt', 'desc');
Query.limit(20);
Query.startAfter(lastCreatedAt);

// Cursor pagination with a document ID tiebreaker, so pages never skip
// or repeat documents when the order field has duplicate values
pipe(
  Query.orderBy('createdAt', 'desc'),
  Query.addOrderByDocumentId('desc'),
  Query.addStartAfter(lastCreatedAt, lastDocId),
  Query.addLimit(20),
);

// Combine
Query.and(
  Query.where('status', '==', 'published'),
  Query.where('likes', '>=', 10),
  Query.orderBy('createdAt', 'desc'),
  Query.limit(20),
);

Query.or(
  Query.where('status', '==', 'published'),
  Query.where('status', '==', 'featured'),
);
```

Fields and operators are validated at compile time against the model.

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
    yield* repo.update(postId, { likes: likes + 1 }); // transactional write
  }),
);
```

- The SDK retries the transaction on contention, so the effect may run more than once.
- Firestore requires all transactional reads to happen before the first write.
- Nested `withTransaction` calls join the ambient transaction.
- `streamDoc`, `streamQuery`, and `deleteRecursive` cannot be used inside a transaction; the client SDK additionally disallows `query`.

`Firestore.withBatch` stages writes on a write batch and commits them atomically when the effect succeeds. When the effect fails, nothing is committed:

```typescript
Firestore.withBatch(
  Effect.gen(function* () {
    const repo = yield* PostRepository;
    yield* Effect.forEach(ids, (id) => repo.update(id, { status: 'archived' }));
  }),
);
```

Batches are write-only: reads inside the effect execute immediately against the database and do not see the staged writes. A batch supports at most 500 writes.

## Schemas

`FirestoreSchema` exports platform-agnostic schemas for Firestore types:

```typescript
import { FirestoreSchema } from 'effect-firebase';

FirestoreSchema.Timestamp; // { seconds, nanoseconds } <-> Timestamp instance
FirestoreSchema.ServerTimestamp; // sentinel for FieldValue.serverTimestamp()
FirestoreSchema.GeoPoint; // { latitude, longitude } <-> GeoPoint instance
FirestoreSchema.Reference; // DocumentReference schema
```

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

## Migration and agent guides

This package ships [`MIGRATION.md`](./MIGRATION.md) (v0.x → v1.0) and [`AGENTS.md`](./AGENTS.md) (condensed usage reference for coding agents). Both are available in `node_modules/effect-firebase/` after installing.

## License

MIT. The Model/Repository pattern is adapted from [`@effect/sql`](https://github.com/Effect-TS/effect/tree/main/packages/sql).
