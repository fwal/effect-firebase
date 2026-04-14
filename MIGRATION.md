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

### 4. Update VariantSchema import (advanced usage only)

If you build custom model fields using `VariantSchema` directly, update the import path:

```ts
// Before (v3)
import { VariantSchema } from '@effect/experimental';

// After (v4)
import { VariantSchema } from 'effect/unstable/schema';
```

Standard field helpers (`Model.Field`, `Model.DateTime`, `Model.DateTimeInsert`, etc.) are unaffected.

### 5. Other Effect v4 renames

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
