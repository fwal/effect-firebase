# AGENTS.md — using `effect-firebase`

Guidance for coding agents (and humans) working in a project that depends on
`effect-firebase`. This file ships inside the npm package
(`node_modules/effect-firebase/AGENTS.md`) together with
[`MIGRATION.md`](./MIGRATION.md). Full docs live at
https://github.com/fwal/effect-firebase.

## What it is

Firebase Firestore + Cloud Functions bindings for [Effect](https://effect.website)
**v4**. Models are Effect `Model.Class` schemas with per-variant field types;
repositories wrap a collection with typed CRUD, queries and live streams; one
`FirestoreService` interface is implemented by the Admin SDK, the Client SDK
and an in-memory mock, so domain code is SDK-agnostic.

| Package                     | Use it for                                             | Runtime deps                           |
| --------------------------- | ------------------------------------------------------ | -------------------------------------- |
| `effect-firebase`           | Models, repositories, queries, `FirestoreService` type | `effect`                               |
| `@effect-firebase/admin`    | Server / Cloud Functions layer + trigger wrappers      | `firebase-admin`, `firebase-functions` |
| `@effect-firebase/client`   | Browser / mobile layer                                 | `firebase`                             |
| `@effect-firebase/mock`     | In-memory backend for tests and local dev (dev-only)   | —                                      |
| `@effect-firebase/devtools` | TanStack Devtools panel for the mock (dev-only)        | `react`                                |

All packages are published under the npm `beta` dist-tag and must share one
version. `effect` is a peer dependency; `@effect/atom-react` (if used) must
match the installed Effect prerelease exactly.

## Import map — read this first

The most common mistake is importing `Model` from `effect-firebase`. It is
not exported there.

```ts
import { Effect, Schema, Option, Stream, pipe } from 'effect';
import { Model } from 'effect/unstable/schema'; // Model.Class, GeneratedByDb, Field, ...
import {
  Firestore, //       field helpers, sentinels, makeRepository, withTransaction/withBatch
  FirestoreSchema, // Timestamp, GeoPoint, Reference schemas
  FirestoreService, // the service tag (Context.Service)
  Query, //           query constraint builders
  FirestoreError, //  tagged errors
} from 'effect-firebase';
import { Admin, FunctionsRuntime, onCallEffect } from '@effect-firebase/admin';
import { Client } from '@effect-firebase/client';
import {
  layer as mockLayer,
  make,
  fixture,
  MockController,
  MockState,
} from '@effect-firebase/mock';
```

Name collisions: `Firestore` is also exported by `firebase/firestore`,
`firebase-admin/firestore`, `@effect-firebase/admin` and
`@effect-firebase/client` (the latter two hold their layer factories). Alias
on import when two meet in one file.

## Define a model

```ts
import { Effect, Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import { Firestore } from 'effect-firebase';

export const PostId = Schema.String.pipe(Schema.brand('PostId'));
export const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));

export class PostModel extends Model.Class<PostModel>('PostModel')({
  id: Model.GeneratedByDb(PostId), // Firestore assigns it; absent from insert/update
  createdAt: Firestore.DateTimeInsert, // server timestamp on insert; absent from update
  updatedAt: Firestore.DateTimeUpdate, // server timestamp on insert and update
  author: Firestore.Reference(AuthorId, 'authors'), // DocumentReference in DB, branded id in app
  title: Schema.String,
  status: Schema.Literal('draft', 'published'),
  likes: Firestore.Number, // accepts Firestore.increment(n) in update
  tags: Firestore.Array(Schema.String), // accepts arrayUnion/arrayRemove in update
  summary: Firestore.OptionalDeletable(Schema.String), // Option in app; Firestore.delete() removes it
  checked: Schema.Boolean.pipe(
    Schema.withDecodingDefault(Effect.succeed(false)),
  ),
}) {
  static idField = 'id' as const;
}
```

Variants: `PostModel` (alias `.select`, what reads decode to), `.insert`,
`.update`, `.json`, `.jsonCreate`, `.jsonUpdate`. Types:
`typeof PostModel.Type`, `typeof PostModel.insert.Type`.

Field helpers (all under `Firestore.` unless noted):

| Helper                                                   | Notes                                                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Model.GeneratedByDb(s)` / `Model.GeneratedByApp(s)`     | From `effect/unstable/schema`. DB-generated ids vs app-generated ids.                                                                      |
| `DateTimeInsert`, `DateTimeUpdate`                       | Auto server timestamps. App type is `DateTime.Utc`.                                                                                        |
| `DateTime`, `ServerDateTime`                             | Plain timestamp; `ServerDateTime` writes server time when given `undefined`.                                                               |
| `WithServerTimestamp(field)`                             | Lets insert/update accept `Firestore.serverTimestamp()` explicitly.                                                                        |
| `Reference(id, path)`, `ReferenceOptional(id, path)`     | Typed reference exposed as branded id.                                                                                                     |
| `ReferenceAsInstance(id, path)`, `ReferencePath(path)`   | Expose `FirestoreSchema.Reference` instance / full path string.                                                                            |
| `AnyIdReference`, `AnyPathReference`                     | Untyped references.                                                                                                                        |
| `Optional(s)`, `OptionalNull(s)`, `OptionalDeletable(s)` | `Option` in app. `Optional` accepts null/undefined, `OptionalNull` only null, `OptionalDeletable` supports `Firestore.delete()` in update. |
| `Array(s)`, `WithArrayFields(field)`                     | `Firestore.arrayUnion([...])` / `arrayRemove([...])` in update.                                                                            |
| `Number`, `WithIncrementField(field)`                    | `Firestore.increment(n)` in update.                                                                                                        |
| `GeoPoint`                                               | `FirestoreSchema.GeoPoint` instance in app, `{ latitude, longitude }` in JSON.                                                             |
| `Model.Field({ select, insert, update, json, ... })`     | Fully custom per-variant schemas (from `effect/unstable/schema`).                                                                          |

## Create a repository

```ts
import { Effect } from 'effect';
import { Firestore, Query } from 'effect-firebase';

export const PostRepository = Firestore.makeRepository(PostModel, {
  collectionPath: 'posts',
  idField: PostModel.idField,
  spanPrefix: 'app.PostRepository', // used for Effect.withSpan names
}).pipe(
  Effect.map((repo) => ({
    ...repo,
    latest: () => repo.queryStream(Query.orderBy('createdAt', 'desc')),
  })),
);
```

`makeRepository` returns `Effect<Repository, never, FirestoreService>`; use
it as a layer input (`yield* PostRepository` inside effects, provide the
service via `Admin.layer`/`Client.layer`/mock).

Repository methods (all fail with `ModelError = FirestoreError | UnknownError | NoSuchElementError | SchemaError`):

| Method                                | Returns                        | Notes                                                                   |
| ------------------------------------- | ------------------------------ | ----------------------------------------------------------------------- |
| `add(data)`                           | `Effect<Id>`                   | `data: typeof Model.insert.Type`. Firestore picks the id.               |
| `set(id, { data, variant?, merge? })` | `Effect<void>`                 | Upsert at a known id. See "Choosing `set` variant" below.               |
| `update(id, data)`                    | `Effect<void>`                 | Fails `not-found` if absent. Sentinels + dotted field paths. See below. |
| `getById(id)`                         | `Effect<Option<Model>>`        | `Option.none()` when missing.                                           |
| `getByIdStream(id)`                   | `Stream<Option<Model>>`        | Live `onSnapshot`.                                                      |
| `delete(id)`                          | `Effect<void>`                 |                                                                         |
| `deleteRecursive(id)`                 | `Effect<void>`                 | **Admin SDK only**; dies on the client layer.                           |
| `query(constraints)`                  | `Effect<ReadonlyArray<Model>>` |                                                                         |
| `queryStream(constraints)`            | `Stream<ReadonlyArray<Model>>` | Live.                                                                   |
| `getByQuery(constraints)`             | `Effect<Option<Model>>`        | First match.                                                            |
| `getByQueryStream(constraints)`       | `Stream<Option<Model>>`        | Live first match.                                                       |

### Choosing `set` variant

`set` inserts when the document is absent and overwrites when present, and it
cannot know which case it is in. `variant` decides how insert-only fields
(`DateTimeInsert`) are treated:

- `variant: 'insert'` (default): payload is `Model.insert.Type`, `createdAt`
  is re-stamped on every write, `merge` included. Use for documents you expect
  to be new.
- `variant: 'update'`: payload is `Model.update.Type`, `createdAt` is omitted;
  with `merge: true` it is preserved, without merge it is dropped. Use for
  documents you expect to exist.

To create-only at a known id without clobbering, read then write inside
`Firestore.withTransaction`; a bare `getById` then `set` is a race. Prefer
`add` (always insert) or `update` (always update) when the intent is fixed.

### Updating nested fields

`update` takes any subset of `Model.update.Type` plus Firestore dotted field
paths into nested maps. A dotted key touches only that nested field; a
whole-field key replaces the whole map (Firestore semantics).

```ts
yield * repo.update(id, { 'metaData.deleted': true }); // only metaData.deleted
yield * repo.update(id, { metaData: { deleted: true, tags: [] } }); // replaces metaData
yield * repo.update(id, { metaData: { deleted: true } }, { merge: true }); // only metaData.deleted
```

`{ merge: true }` takes a deep partial and flattens nested objects into dotted
paths before the write, like Firestore's `set(..., { merge: true })`. Arrays,
class instances (`DateTime`, sentinels…) and `Option.none()` are leaves and
are written whole; `Option.some({ ... })` is merged into. An empty object
contributes nothing (writing an empty map would clobber the existing one).

Paths are typed (`UpdateData<T>`) and descend through `Schema.Struct`,
`Model.Struct`, `Schema.Class`, `Schema.Record` (keys checked against the key
schema), `Schema.suspend`, `Schema.optional` and `OptionalDeletable`; arrays,
`DateTime`, `Timestamp`, `GeoPoint`, `Reference` and sentinel classes are
leaves. Each leaf is encoded through its own field schema, so a nested
`Firestore.Number` accepts `increment(n)` at `'stats.likes'`.

Depth is capped at `Firestore.MAX_FIELD_PATH_DEPTH` (5 levels below a
top-level field) at both the type and runtime level; deeper writes go through
`FirestoreService.update`. Recursive schemas work: declare the recursive type
as a type alias to get typed paths into it (an interface is a leaf at the type
level; the runtime resolves either).

Keys the model does not declare (typos, paths into scalars) fail with
`SchemaError` naming the key; they are never dropped. An empty payload fails
with `FirestoreError` code `invalid-argument` instead of the SDK's "At least
one field must be updated". `add` and `set` reject undeclared keys the same
way.

## Queries

```ts
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

// Pipeable form + cursor pagination with document-id tiebreaker
repo.query(
  pipe(
    Query.orderBy<typeof PostModel, 'createdAt'>('createdAt', 'desc'),
    Query.addOrderByDocumentId('desc'),
    Query.addStartAfter(lastPost.createdAt, lastPost.id),
    Query.addLimit(20),
  ),
);
```

Constructors: `where`, `orderBy`, `orderByDocumentId`, `limit`,
`limitToLast`, `startAt`, `startAfter`, `endAt`, `endBefore`, `and`, `or`,
`empty`, plus `add*` pipeable variants of each. Field names and operators are
checked against the model at compile time; field names include dotted paths
into nested maps, following the same descent rules and depth cap as `update`
(see "Updating nested fields"). Cursor values are encoded like
document data, so `DateTime.Utc`, `FirestoreSchema.Timestamp`, strings and
numbers all work. Firestore has no offset pagination; use cursors (see the
React guide for a growing-limit live feed and a cursor-stack prev/next).

## Writes with sentinels

```ts
yield *
  repo.update(id, {
    likes: Firestore.increment(1),
    tags: Firestore.arrayUnion(['effect']),
    summary: Firestore.delete(),
    lastSeenAt: Firestore.serverTimestamp(), // field declared with WithServerTimestamp
  });
```

Sentinels are only accepted by the variant the field helper declares them for
(`update` for increment/array/delete, `insert`+`update` for server timestamp).
`DateTimeInsert`/`DateTimeUpdate` are managed automatically; do not pass them.

## Transactions and batches

```ts
import { Firestore } from 'effect-firebase';

Firestore.withTransaction(
  Effect.gen(function* () {
    const repo = yield* PostRepository;
    const post = yield* repo.getById(id); // all reads before the first write
    yield* repo.update(id, { likes: Firestore.increment(1) });
  }),
);

Firestore.withBatch(
  Effect.gen(function* () {
    const repo = yield* PostRepository;
    yield* Effect.forEach(ids, (id) =>
      repo.update(id, { status: 'published' }),
    );
  }),
);
```

Rules: every repository/`FirestoreService` call inside the effect is routed
through the ambient transaction/batch; nested calls join it. Transactions may
be retried (effect must be idempotent); reads must precede writes; streams and
`deleteRecursive` die inside a transaction; the **client SDK cannot `query`
inside a transaction** (document reads only). Batches are write-only (reads
run immediately, do not see staged writes), max 500 writes. The mock runs
both as plain pass-through.

## Providing `FirestoreService`

```ts
// Server / Cloud Functions
import { initializeApp } from 'firebase-admin/app';
import { Admin } from '@effect-firebase/admin';
const adminLayer = Admin.layer({ app: initializeApp() }); // or { firestore }, or () for default app
// Admin.layer also installs a Cloud Logging Effect logger.

// Browser
import { initializeApp } from 'firebase/app';
import { Client } from '@effect-firebase/client';
const clientLayer = Client.layer({ app: initializeApp(config) }); // or { firestore }, or ()

// Tests / local dev
import { layer as mockLayer } from '@effect-firebase/mock';
const testLayer = mockLayer({
  fixtures: [posts],
  states: { comments: 'loading' },
  latency: '200 millis',
});

// Compose with repositories
const AppLayer = Layer.mergeAll(PostRepository, AuthorRepository).pipe(
  Layer.provideMerge(adminLayer),
);
```

Repositories are `Effect`s, not `Layer`s: run them with `Effect.provide(PostRepository)`
or wrap in `Layer.effect(Tag, PostRepository)` if you want a service tag.

## Cloud Functions (`@effect-firebase/admin`)

```ts
import { Effect, Layer, Schema } from 'effect';
import { initializeApp } from 'firebase-admin/app';
import {
  Admin,
  FunctionsRuntime,
  onCallEffect,
  onDocumentCreatedEffect,
  onScheduleEffect,
} from '@effect-firebase/admin';

export const runtime = FunctionsRuntime.make(
  Admin.layer({ app: initializeApp() }),
); // one per process
// FunctionsRuntime.Default(app?) is the shorthand for the line above.

export const createPost = onCallEffect(
  {
    runtime,
    region: 'europe-north1',
    inputSchema: Input,
    outputSchema: Output,
  },
  (input, context) =>
    Effect.gen(function* () {
      const repo = yield* PostRepository;
      const id = yield* repo.add({
        ...input,
        author: AuthorId.make(context.auth!.uid),
        status: 'draft',
      });
      return { id };
    }).pipe(Effect.provide(PostRepository)),
);

export const onPostCreated = onDocumentCreatedEffect(
  { runtime, document: 'posts/{postId}', schema: PostModel, idField: 'id' },
  (post, event) => Effect.log(`created ${post.id}`),
);

export const nightly = onScheduleEffect(
  { runtime, schedule: 'every 24 hours', timeZone: 'UTC' },
  (event) => Effect.log(event.jobName),
);
```

Wrappers: `onRequestEffect` (HTTP; optional `bodySchema`/`responseSchema`),
`onCallEffect` (optional `inputSchema`/`outputSchema`; handler receives
decoded input + `context.auth` when `inputSchema` is set, else the raw
request), `onDocumentCreated/Updated/Deleted/WrittenEffect`,
`onMessagePublishedEffect` (Pub/Sub, `messageSchema`), `onTaskDispatchedEffect`
(`schema`), `onScheduleEffect`. All accept the native firebase-functions
options plus `runtime`, trace with `Effect.withSpan`, and log defects.
Handlers' `R` must be provided by the runtime layer or inside the handler.

## Testing with the mock

```ts
import { Effect, Layer } from 'effect';
import { fixture, layer, MockController } from '@effect-firebase/mock';

const posts = fixture(PostModel, {
  collectionPath: 'posts',
  idField: 'id',
  docs: [new PostModel({/* ... */})],
});

it('lists posts', () =>
  Effect.gen(function* () {
    const repo = yield* PostRepository;
    const all = yield* repo.query(Query.empty());
    expect(all).toHaveLength(1);
    yield* (yield* MockController).setState('posts', 'error'); // reads now fail
  }).pipe(
    Effect.provide(PostRepository),
    Effect.provide(layer({ fixtures: [posts] })),
    Effect.runPromise,
  ));
```

- `layer()` builds a fresh store per layer build; Effect memoises layers, so
  call `layer()` again for an isolated store.
- `make()` returns `{ layer, controller }` for driving the store from outside
  Effect (devtools, Storybook). `@effect-firebase/devtools` exposes
  `firestoreMockPlugin(controller)` and `<MockDevtoolsPanel controller />`.
- `MockFirestoreService(overrides)` is the older per-method stub; prefer
  `layer()`.
- States: `data | empty | loading | error` per collection or `MockState.All`.
  `loading` suspends reads and writes; `error` fails live streams
  terminally (re-subscribe after recovery).
- Not simulated: security rules, composite index requirements, transaction
  retries/rollback, persistence.

## React

Use `@effect/atom-react` with a layer atom as the single seam between
production and test layers. The full pattern (runtime atom, `Atom.family`
per id, mutations with `reactivityKeys`, pagination, forms via
`Schema.toStandardSchemaV1`, mock devtools) is in `REACT.md` at the repo
root: https://github.com/fwal/effect-firebase/blob/main/REACT.md.

## Errors

- `FirestoreError { code, name, message }` — SDK errors; `code` is the
  Firestore error code string (`'not-found'`, `'permission-denied'`, ...).
- `SchemaError` (from `effect`) — decode/encode failures; narrow with
  `Schema.isSchemaError` or `Effect.catchTag('SchemaError', ...)`.
- `NoSuchElementError`, `UnknownError` (from `effect/Cause`).
- `NotInitializedError` — from `noopLayer` when no real layer was provided.
- Effect v4 names: `Effect.catch` (not `catchAll`), `Effect.catchTag`,
  `Effect.catchDefect`.

## Gotchas checklist

1. `Model` comes from `effect/unstable/schema`; Firestore field helpers and
   `makeRepository` come from `Firestore` in `effect-firebase`.
2. Variants are `select`/`insert`/`update`/`json`/`jsonCreate`/`jsonUpdate`
   (not `get`/`add`).
3. `getById` returns `Option`; it does not fail on a missing document.
4. `deleteRecursive` is Admin-only. `query` inside a transaction is
   Admin-only.
5. Pick `set`'s `variant` deliberately; the default re-stamps `createdAt`.
6. Cursor pagination: add `Query.addOrderByDocumentId()` and pass the doc id
   as the second cursor value when the order field can have duplicates.
7. Keep `effect`, all `@effect-firebase/*` and `@effect/atom-react` versions
   aligned; install with the `@beta` tag.
8. Sentinels (`increment`, `arrayUnion`, `delete`, `serverTimestamp`) are only
   valid on fields declared with the matching helper, and only in the
   variants that helper allows.
9. Style used throughout the library: explicit lambdas (`Effect.map((x) => f(x))`),
   no point-free `Effect.map(f)`.
10. Nested updates use dotted keys (`'a.b': v`) or `{ merge: true }` with a
    nested partial; a plain `{ a: { b: v } }` replaces the whole `a` map.
    Undeclared keys fail with `SchemaError`; `update` never silently drops
    them.

## Where to look

- This package: `README.md` (models, repos, queries, transactions),
  `MIGRATION.md` (v0.x → v1.0).
- `@effect-firebase/admin/README.md` — every trigger wrapper with examples,
  Cloud Logging, troubleshooting duplicate `firebase-admin` copies.
- `@effect-firebase/mock/README.md` — fixtures, simulated states, `make()`.
- `@effect-firebase/devtools/README.md` — TanStack Devtools plugin and the
  epoch/`Atom.family` trick for making toggles visible on mounted pages.
- Repo: https://github.com/fwal/effect-firebase (example app under
  `example/`, React guide `REACT.md`).
