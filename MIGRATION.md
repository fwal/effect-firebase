# Migration Guide

## v0.10.x → v0.20.x (Effect v4)

This release upgrades the peer dependency from Effect v3 to Effect v4. Effect v4 introduces several breaking changes that affect how you use this library.

### 1. Update dependencies

Remove `@effect/experimental` — it has been merged into the core `effect` package.

```bash
npm uninstall @effect/experimental
npm install effect@^4.0.0
```

Or with pnpm:

```bash
pnpm remove @effect/experimental
pnpm add effect@^4.0.0
```

### 2. Update error tag strings

Effect v4 renames several built-in error types. These appear in the error channel of repository methods like `getById` and `getOne`.

| v3 tag string              | v4 tag string          |
| -------------------------- | ---------------------- |
| `'NoSuchElementException'` | `'NoSuchElementError'` |
| `'ParseError'`             | `'SchemaError'`        |
| `'UnknownException'`       | `'UnknownError'`       |

```ts
// Before (v3)
repo.getById(id).pipe(
  Effect.catchTag('NoSuchElementException', () => Effect.succeed(null)),
  Effect.catchTag('ParseError', (e) => Effect.fail(new MyError({ cause: e })))
);

// After (v4)
repo.getById(id).pipe(
  Effect.catchTag('NoSuchElementError', () => Effect.succeed(null)),
  Effect.catchTag('SchemaError', (e) => Effect.fail(new MyError({ cause: e })))
);
```

> **Note:** The library's own error types (`FirestoreError`, `FirestoreQueryError`, `UnexpectedTypeError`) are unchanged.

### 3. Update effectful Schema functions

If you use Schema functions that return `Effect` (rather than throwing), these have been renamed in v4:

| v3                             | v4                                   |
| ------------------------------ | ------------------------------------ |
| `Schema.encode(schema)`        | `Schema.encodeEffect(schema)`        |
| `Schema.decodeUnknown(schema)` | `Schema.decodeUnknownEffect(schema)` |
| `Schema.encodeUnknown(schema)` | `Schema.encodeUnknownEffect(schema)` |

The sync variants are **unchanged**: `Schema.encodeSync`, `Schema.decodeUnknownSync`, `Schema.decodeSync`.

### 4. Model class and field helpers

The `Model` namespace is no longer exported from `effect-firebase`. The model class is now provided by Effect itself, and `effect-firebase` only exports Firestore-specific field types under a new `Firestore` namespace.

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
  id: Model.Generated(AuthorId), // generic helpers from Effect's Model
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

Generic field helpers that no longer need the `effect-firebase` import:

| Field helper           | Now from                 |
| ---------------------- | ------------------------ |
| `Model.Class`          | `effect/unstable/schema` |
| `Model.Generated`      | `effect/unstable/schema` |
| `Model.GeneratedByApp` | `effect/unstable/schema` |
| `Model.Sensitive`      | `effect/unstable/schema` |
| `Model.FieldOption`    | `effect/unstable/schema` |
| `Model.JsonFromString` | `effect/unstable/schema` |

Firestore-specific field helpers remain under the `Firestore` namespace in `effect-firebase`:

| Field helper                  | Namespace       |
| ----------------------------- | --------------- |
| `Firestore.DateTimeInsert`    | effect-firebase |
| `Firestore.DateTimeUpdate`    | effect-firebase |
| `Firestore.DateTime`          | effect-firebase |
| `Firestore.Reference`         | effect-firebase |
| `Firestore.ReferenceOptional` | effect-firebase |
| `Firestore.ReferencePath`     | effect-firebase |
| `Firestore.OptionalDeletable` | effect-firebase |
| `Firestore.Optional`          | effect-firebase |
| `Firestore.OptionalNull`      | effect-firebase |
| `Firestore.Array`             | effect-firebase |
| `Firestore.WithArrayFields`   | effect-firebase |
| `Firestore.makeRepository`    | effect-firebase |
| `Firestore.delete`            | effect-firebase |
| `Firestore.arrayUnion`        | effect-firebase |
| `Firestore.arrayRemove`       | effect-firebase |

**Variant name changes (advanced usage only)**

If you access schema variants directly (e.g. for custom repository logic or field definitions), the variant names have changed to align with Effect's Model:

| Old variant name | New variant name    |
| ---------------- | ------------------- |
| `.add`           | `.insert`           |
| `.jsonAdd`       | `.jsonCreate`       |
| `.get` (default) | `.select` (default) |

```ts
// Before
const encoded = Schema.encodeSync(MyModel.add)(data);

// After
const encoded = Schema.encodeSync(MyModel.insert)(data);
```

### 5. Update `FirestoreField` import (converter usage)

If you use the Firestore data converter helpers (`Delete`, `ArrayUnion`, `ArrayRemove`), these have moved from `FirestoreField` to the unified `Firestore` namespace:

```ts
// Before
import { FirestoreField } from 'effect-firebase';
if (data instanceof FirestoreField.Delete) { ... }
if (data instanceof FirestoreField.ArrayUnion) { ... }

// After
import { Firestore } from 'effect-firebase';
if (data instanceof Firestore.Delete) { ... }
if (data instanceof Firestore.ArrayUnion) { ... }
```

Note: If you import `Firestore` from a Firebase SDK in the same file, you will need to alias one of them:

```ts
import { Firestore as FirebaseFirestore } from 'firebase/firestore';
import { Firestore } from 'effect-firebase';
```

### 6. Update VariantSchema import (advanced usage only)

If you build custom model fields using `VariantSchema` directly, update the import path:

```ts
// Before (v3)
import { VariantSchema } from '@effect/experimental';

// After (v4)
import { VariantSchema } from 'effect/unstable/schema';
```

### 7. Other Effect v4 renames

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

For a complete list of Effect v4 breaking changes beyond what's covered here, see the [Effect migration guide](https://effect.website/docs/migration-guide).
