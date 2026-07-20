# effect-firebase

Core library for Effect Firebase. Provides Firestore schemas, a model/repository pattern, and a type-safe query builder. Works with both the Admin and Client SDKs via a platform-agnostic `FirestoreService` interface.

> [!WARNING]
> Under heavy development. APIs may change.

## Installation

```bash
npm install effect-firebase effect
```

## Models

Define a model with `Model.Class`. Each field declares how it behaves across variants: `get` (read), `add` (create), `update` (partial update), and `json` (serialization).

```typescript
import { Schema } from 'effect';
import { Model } from 'effect-firebase';

const PostId = Schema.String.pipe(Schema.brand('PostId'));

class PostModel extends Model.Class<PostModel>('PostModel')({
  id: Model.GeneratedByDb(PostId), // excluded from add and update
  createdAt: Model.DateTimeInsert, // set on create, excluded from update
  updatedAt: Model.DateTimeUpdate, // set on every write
  author: Model.Reference(AuthorId, 'authors'), // stored as DocumentReference
  title: Schema.String,
  content: Schema.String,
  status: Schema.Literal('draft', 'published'),
}) {}
```

Built-in field helpers:

| Helper                                      | Behaviour                                                    |
| ------------------------------------------- | ------------------------------------------------------------ |
| `Model.GeneratedByDb(schema)`               | Auto-generated (e.g. IDs). Excluded from `add` and `update`. |
| `Model.DateTimeInsert`                      | Server timestamp on create. Excluded from `update`.          |
| `Model.DateTimeUpdate`                      | Server timestamp on every write.                             |
| `Model.Reference(id, collection)`           | Branded ID in app, `DocumentReference` in Firestore.         |
| `Model.ReferenceAsInstance(id, collection)` | Same, but exposes `DocumentReference` in the app layer.      |
| `Model.OptionalDeletable(schema)`           | Optional field that can be deleted with a sentinel value.    |
| `Model.Array(schema)`                       | Array field.                                                 |
| `Model.GeoPoint`                            | Geographic point with latitude and longitude.                |
| `Model.Field({get, add, update, json})`     | Fully custom per-variant schemas.                            |

## Repository

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
    published: () => repo.queryStream(Query.where('status', '==', 'published')),
  }))
);
```

Available methods on every repository:

```typescript
repo.add(data); // Effect<PostId>
repo.update(id, data); // Effect<void>
repo.set(id, data); // Effect<void>
repo.remove(id); // Effect<void>
repo.getById(id); // Effect<Post, NoSuchElementError | SchemaError | FirestoreError>
repo.findById(id); // Effect<Option<Post>, SchemaError | FirestoreError>
repo.query(...constraints); // Effect<ReadonlyArray<Post>>
repo.queryStream(...constraints); // Stream<ReadonlyArray<Post>>
repo.findOne(...constraints); // Effect<Option<Post>>
repo.getOne(...constraints); // Effect<Post, NoSuchElementError | ...>
```

## Queries

```typescript
import { Query } from 'effect-firebase';

Query.where('status', '==', 'published');
Query.orderBy('createdAt', 'desc');
Query.limit(20);
Query.startAfter(lastDoc);

// Combine
Query.and(
  Query.where('status', '==', 'published'),
  Query.where('likes', '>=', 10),
  Query.orderBy('createdAt', 'desc'),
  Query.limit(20)
);

Query.or(
  Query.where('status', '==', 'published'),
  Query.where('status', '==', 'featured')
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
  })
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
  })
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
  Effect.catchTag('NoSuchElementError', () => Effect.succeed(null)),
  Effect.catchTag('SchemaError', (e) =>
    Effect.fail(new AppError({ cause: e }))
  ),
  Effect.catchTag('FirestoreError', (e) =>
    Effect.fail(new AppError({ cause: e }))
  )
);
```

## License

MIT. The Model/Repository pattern is adapted from [`@effect/sql`](https://github.com/Effect-TS/effect/tree/main/packages/sql).
