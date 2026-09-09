# Migration Guide

This file ships inside the `effect-firebase` npm package
(`node_modules/effect-firebase/MIGRATION.md`) so it is available offline and
to coding agents. The companion [`AGENTS.md`](./AGENTS.md) describes current
usage; this file only covers what changed.

## v0.x → v1.0 (Effect v4)

v1.0 (published as `1.0.0-beta.*` under the npm `beta` dist-tag) moves the
peer dependency from Effect v3 to Effect v4 and reorganises the public API
around the `Firestore` namespace. Work through the sections in order; steps
1–6 are required for every project, 7–13 depend on which APIs you use.

### 1. Update dependencies

Remove `@effect/experimental` — it has been merged into the core `effect`
package — and install the `beta` tag of every `effect-firebase` package you
use, together with Effect v4.

```bash
npm uninstall @effect/experimental
npm install effect@^4.0.0 effect-firebase@beta
npm install @effect-firebase/admin@beta      # if used
npm install @effect-firebase/client@beta     # if used
npm install --save-dev @effect-firebase/mock@beta @effect-firebase/devtools@beta
```

Or with pnpm:

```bash
pnpm remove @effect/experimental
pnpm add effect@^4.0.0 effect-firebase@beta
```

Keep all `@effect-firebase/*` packages on the same version. If you use
`@effect/atom-react`, it peer-depends on the exact Effect prerelease it was
built against — bump it together with `effect`.

### 2. Update error tag strings

Effect v4 renames several built-in error types. They appear in the error
channel of repository methods (the `ModelError` union).

| v3 tag string              | v4 tag string          |
| -------------------------- | ---------------------- |
| `'NoSuchElementException'` | `'NoSuchElementError'` |
| `'ParseError'`             | `'SchemaError'`        |
| `'UnknownException'`       | `'UnknownError'`       |

```ts
// Before (v3)
repo.getById(id).pipe(
  Effect.catchTag('NoSuchElementException', () => Effect.succeed(null)),
  Effect.catchTag('ParseError', (e) => Effect.fail(new MyError({ cause: e }))),
);

// After (v4)
repo.getById(id).pipe(
  Effect.catchTag('NoSuchElementError', () => Effect.succeed(null)),
  Effect.catchTag('SchemaError', (e) => Effect.fail(new MyError({ cause: e }))),
);
```

> **Note:** The library's own error types (`FirestoreError`, `NotFoundError`,
> `UnexpectedTypeError`, `NotInitializedError`) are unchanged.

### 3. Update effectful Schema functions

Schema functions that return `Effect` (rather than throwing) were renamed in
v4:

| v3                             | v4                                   |
| ------------------------------ | ------------------------------------ |
| `Schema.encode(schema)`        | `Schema.encodeEffect(schema)`        |
| `Schema.decodeUnknown(schema)` | `Schema.decodeUnknownEffect(schema)` |
| `Schema.encodeUnknown(schema)` | `Schema.encodeUnknownEffect(schema)` |

The sync variants are **unchanged**: `Schema.encodeSync`,
`Schema.decodeUnknownSync`, `Schema.decodeSync`.

### 4. Model class and field helpers

The `Model` namespace is no longer exported from `effect-firebase`. The model
class and the generic field helpers now come from Effect itself
(`effect/unstable/schema`), and `effect-firebase` exports only the
Firestore-specific pieces under the `Firestore` namespace.

**Before:**

```ts
import { Model } from 'effect-firebase';

class AuthorModel extends Model.Class<AuthorModel>('AuthorModel')({
  id: Model.Generated(AuthorId),
  createdAt: Model.DateTimeInsert,
  updatedAt: Model.DateTimeUpdate,
  author: Model.Reference(AuthorId, 'authors'),
  optional: Model.OptionalDeletable(Schema.String),
  list: Model.Array(Schema.String),
}) {}

const AuthorRepository = Model.makeRepository(AuthorModel, {
  collectionPath: 'authors',
  idField: 'id',
  spanPrefix: 'example.AuthorRepository',
});
```

**After:**

```ts
import { Model } from 'effect/unstable/schema';
import { Firestore } from 'effect-firebase';

class AuthorModel extends Model.Class<AuthorModel>('AuthorModel')({
  id: Model.GeneratedByDb(AuthorId), // generic helpers from Effect's Model
  createdAt: Firestore.DateTimeInsert, // Firestore-specific helpers from effect-firebase
  updatedAt: Firestore.DateTimeUpdate,
  author: Firestore.Reference(AuthorId, 'authors'),
  optional: Firestore.OptionalDeletable(Schema.String),
  list: Firestore.Array(Schema.String),
}) {}

const AuthorRepository = Firestore.makeRepository(AuthorModel, {
  collectionPath: 'authors',
  idField: 'id',
  spanPrefix: 'example.AuthorRepository',
});
```

Generic helpers that moved to `effect/unstable/schema`:

| v0.x (`effect-firebase`) | v1.0 (`effect/unstable/schema`)                 |
| ------------------------ | ----------------------------------------------- |
| `Model.Class`            | `Model.Class`                                   |
| `Model.Generated`        | `Model.GeneratedByDb` (**renamed**)             |
| `Model.GeneratedByApp`   | `Model.GeneratedByApp`                          |
| `Model.Sensitive`        | `Model.Sensitive`                               |
| `Model.Override`         | `Model.Override`                                |
| `Model.Field`            | `Model.Field` (variant keys renamed, see below) |
| `Model.fields`           | `Model.fields`                                  |
| `Model.FieldOption`      | `Model.FieldOption`                             |
| `Model.JsonFromString`   | `Model.JsonFromString`                          |

Firestore-specific helpers that moved from `Model.*` to `Firestore.*` in
`effect-firebase` (same names):

- Timestamps: `DateTime`, `ServerDateTime`, `DateTimeInsert`, `DateTimeUpdate`
- References: `Reference`, `ReferenceOptional`, `ReferencePath`,
  `ReferenceAsInstance`, `AnyIdReference`, `AnyPathReference`
- Optionals: `Optional`, `OptionalNull`, `OptionalDeletable`
- Arrays: `Array`, `WithArrayFields`
- Sentinels: `delete`, `arrayUnion`, `arrayRemove` (and the classes `Delete`,
  `ArrayUnion`, `ArrayRemove`)
- Repository: `makeRepository`

New in v1.0 under `Firestore.*`: `GeoPoint`, `Number`, `WithIncrementField`,
`WithServerTimestamp`, `increment`, `serverTimestamp`, `Increment`,
`withTransaction`, `withBatch`.

**Variant name changes**

The schema variants follow Effect's `Model` naming. This affects
`Model.Field({...})` definitions, `Model.fieldEvolve`, and any direct access
to a model's variant schemas (e.g. `PostModel.add`):

| Old variant name | New variant name    |
| ---------------- | ------------------- |
| `.get` (default) | `.select` (default) |
| `.add`           | `.insert`           |
| `.update`        | `.update`           |
| `.json`          | `.json`             |
| `.jsonAdd`       | `.jsonCreate`       |
| `.jsonUpdate`    | `.jsonUpdate`       |

```ts
// Before
const encoded = Schema.encodeSync(MyModel.add)(data);
const Custom = Model.Field({ get: A, add: B, update: C, json: D });

// After
const encoded = Schema.encodeSync(MyModel.insert)(data);
const Custom = Model.Field({ select: A, insert: B, update: C, json: D });
```

`Model.VariantsDatabase` is now `'select' | 'insert' | 'update'` and
`Model.VariantsJson` is `'json' | 'jsonCreate' | 'jsonUpdate'`.

**`ServerDateTime` is no longer `Overrideable`.** In v0.x
`Model.ServerDateTime` was wrapped in `VariantSchema.Overrideable` and
required `Model.Override(value)` to write an explicit timestamp. In v1.0
`Firestore.ServerDateTime` is a plain field: pass a `DateTime.Utc` to write
that instant, or `undefined` to write the server timestamp. For fields where
you want to opt into the server timestamp explicitly, wrap any timestamp
field in `Firestore.WithServerTimestamp(...)` and pass
`Firestore.serverTimestamp()`.

### 5. Update `FirestoreField` import (converter usage)

The sentinel classes (`Delete`, `ArrayUnion`, `ArrayRemove`) moved from
`FirestoreField` to the unified `Firestore` namespace, joined by the new
`Increment`:

```ts
// Before
import { FirestoreField } from 'effect-firebase';
if (data instanceof FirestoreField.Delete) { ... }
if (data instanceof FirestoreField.ArrayUnion) { ... }

// After
import { Firestore } from 'effect-firebase';
if (data instanceof Firestore.Delete) { ... }
if (data instanceof Firestore.ArrayUnion) { ... }
if (data instanceof Firestore.Increment) { ... }
```

If you import `Firestore` from a Firebase SDK (or from
`@effect-firebase/admin` / `@effect-firebase/client`, which export a
`Firestore` namespace holding their layers) in the same file, alias one of
them:

```ts
import { Firestore as FirebaseFirestore } from 'firebase/firestore';
import { Firestore } from 'effect-firebase';
```

### 6. Update VariantSchema import (advanced usage only)

If you build custom model fields with `VariantSchema` directly, update the
import path:

```ts
// Before (v3)
import { VariantSchema } from '@effect/experimental';

// After (v4)
import { VariantSchema } from 'effect/unstable/schema';
```

### 7. Repository API additions

Nothing was removed from repositories. `add`, `update`, `getById`,
`getByIdStream`, `delete`, `query` and `queryStream` keep their signatures
(modulo the error renames in step 2). New methods:

| Method                                | Purpose                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `set(id, { data, variant?, merge? })` | Upsert at a known ID. `variant` (`'insert'` default or `'update'`) picks the encoding schema; see the README. |
| `deleteRecursive(id)`                 | Delete a document and its subcollections. **Admin SDK only** — dies on the client layer.                      |
| `getByQuery(constraints)`             | First result of a query as `Option`.                                                                          |
| `getByQueryStream(constraints)`       | Live `Stream` of the first result.                                                                            |

If you hand-rolled `set` through `FirestoreService.set` with a repository's
encoder, replace it with `repo.set` and choose the `variant` deliberately —
`'insert'` re-stamps `DateTimeInsert` fields on every write, `'update'` with
`merge: true` preserves them.

**Undeclared keys are rejected.** `add`, `set` and `update` used to strip any
key the model does not declare before writing; a `repo.update(id, { 'a.b': 1 })`
degenerated into an empty write that Firestore rejected with "At least one
field must be updated". They now fail with a `SchemaError` naming the key,
and an empty `update` payload fails with `FirestoreError` code
`invalid-argument`. If a call site relied on extra keys being dropped, remove
them from the payload.

**Nested updates use dotted paths.** `update` accepts Firestore field paths
typed against the model (`'metaData.deleted': true`) and encodes each leaf
through its own field schema, so nested sentinels work. Replace hand-rolled
`FirestoreService.update(path, { 'a.b': v })` calls with `repo.update(id,
{ 'a.b': v })`. Note that a whole-field key (`metaData: { ... }`) still
replaces the entire map.

### 8. `FirestoreService` shape changes (custom layers and test doubles)

Only relevant if you implement `FirestoreService` yourself or pass overrides
to `MockFirestoreService`.

| v0.x                  | v1.0                                                    |
| --------------------- | ------------------------------------------------------- |
| `remove(path)`        | `delete(path)` (**renamed**)                            |
| `set(path, data)`     | `set(path, data, options?)` with `options.merge`        |
| —                     | `withTransaction(effect)` (**new, required**)           |
| —                     | `withBatch(effect)` (**new, required**)                 |
| `Context.Tag` service | `Context.Service` (`yield* FirestoreService` unchanged) |

The `noopLayer` and `MockFirestoreService` already implement the new members
(`MockFirestoreService` runs `withTransaction`/`withBatch` as pass-through).
Custom implementations that do not support transactions can do the same:

```ts
withTransaction: (self) => self,
withBatch: (self) => self,
```

Transactions and batches are exposed to application code as
`Firestore.withTransaction` and `Firestore.withBatch`; every repository call
inside the effect is routed through the ambient transaction/batch. Read the
caveats on `FirestoreService.withTransaction` before using them (all reads
before the first write, the effect may be retried, streams and
`deleteRecursive` die inside a transaction, the client SDK cannot `query`
inside a transaction).

### 9. Timestamp and DateTime behaviour

- **Query cursors accept `DateTime` values.** Decoded models expose
  timestamps as Effect `DateTime.Utc`; the admin and client converters now
  encode them to native `Timestamp`s, so `Query.startAfter(post.createdAt)`
  works. In v0.x this silently encoded a plain object and matched nothing.
- **`FirestoreSchema.Timestamp.fromMillis`/`fromDate` are correct for
  pre-1970 instants** (nanoseconds are always non-negative, matching
  Firestore). If you relied on the old negative-nanos output, stop.
- **Generated timestamps are bounded.** `Schema.toArbitrary` on timestamp
  fields now stays within Firestore's valid range (years 0001–9999), so
  property tests and generated fixtures produce storable dates.
- **JSON Schema annotations.** The sentinel and Firestore type schemas carry
  `jsonSchema` annotations, so models can be turned into JSON Schema and
  their `json*` variants round-trip through `JSON.stringify`/`JSON.parse`.

### 10. Query additions

`Query.orderByDocumentId(direction?)`, `Query.addOrderByDocumentId(direction?)`
and the `Query.documentIdFieldPath` constant (`'__name__'`) are new. Use them
as a secondary order for cursor pagination so pages never skip or repeat rows
when the primary order field has duplicates:

```ts
pipe(
  Query.orderBy('createdAt', 'desc'),
  Query.addOrderByDocumentId('desc'),
  Query.addStartAfter(lastCreatedAt, lastDocId),
  Query.addLimit(20),
);
```

All existing constructors (`where`, `orderBy`, `limit`, `limitToLast`,
`startAt`, `startAfter`, `endAt`, `endBefore`, `and`, `or`, and the `add*`
pipeable forms) are unchanged.

### 11. `@effect-firebase/admin` and `@effect-firebase/client`

- **`onScheduleEffect` is new** (`firebase-functions/v2/scheduler`). Failures
  are logged and rethrown so Cloud Scheduler's retry policy applies.
- **`App` is a `Context.Service`** in both packages (was `Context.Tag`).
  `yield* App` and `App.layer(app)` are unchanged; only code that referenced
  the class's `Context.Tag` type explicitly needs updating.
- **`Logger.cloudConsole` is now a `Logger.layer(...)`** (was
  `Logger.replace(...)`). `Admin.layer` still merges it automatically; if you
  provided it manually, provide the layer as-is.
- Layer factories (`Admin.layer`, `Client.layer`, `layerFromFirestore`,
  `layerFromApp`, `FunctionsRuntime.make`/`Default`) and every existing
  trigger wrapper keep their signatures.

### 12. `@effect-firebase/mock` and `@effect-firebase/devtools`

`@effect-firebase/mock` is now a real in-memory, reactive backend:

- `layer(options?)` — fresh store per build; provides `FirestoreService` and
  `MockController`.
- `make(options?)` — returns `{ layer, controller }` so code outside Effect
  (devtools, Storybook, imperative tests) can drive the same store.
- `fixture(Model, { collectionPath, idField, docs })` and
  `rawFixture(collectionPath, docs)` — seed data through the real schema
  pipeline.
- `MockController` / `MockState` — flip collections between
  `data | empty | loading | error`, seed, set latency, reset.

`MockFirestoreService(overrides)` remains for per-method stubs, but new tests
should use `layer()` — it honours sentinels, server timestamps, queries and
live streams. The mock runs `withTransaction`/`withBatch` directly (no
retries, rollback or staging).

`@effect-firebase/devtools` is a new dev-only package: `firestoreMockPlugin`
(TanStack Devtools) and `MockDevtoolsPanel` (standalone React) for toggling
the mock's simulated states live.

### 13. Other Effect v4 renames

Additional Effect v4 breaking changes you may encounter in your own code:

| v3                                                | v4                                                             |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `Effect.catchAll(f)`                              | `Effect.catch(f)`                                              |
| `Effect.catchAllDefect(f)`                        | `Effect.catchDefect(f)`                                        |
| `Effect.catchAllCause(f)`                         | `Effect.catchCause(f)`                                         |
| `Schema.Union(a, b, ...)`                         | `Schema.Union([a, b, ...])`                                    |
| `struct.pick('field')`                            | `struct.mapFields(Struct.pick(['field']))`                     |
| `ParseResult.ArrayFormatter.formatErrorSync(e)`   | `e.message` (use `Schema.isSchemaError(e)` to narrow)          |
| `import { ParseError } from 'effect/ParseResult'` | `import { Schema } from 'effect'` → use `Schema.isSchemaError` |
| `Context.Tag('id')<Self, Shape>()`                | `Context.Service<Self, Shape>()('id')`                         |

For a complete list of Effect v4 breaking changes beyond what's covered here,
see the [Effect migration guide](https://effect.website/docs/migration-guide).
