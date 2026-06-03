export * as FirestoreSchema from './lib/firestore/schema/schema.js';
export * as FirestoreField from './lib/firestore/fields/fields.js';
export * from './lib/firestore/firestore-service.js';
export * from './lib/firestore/errors.js';
export * from './lib/firestore/snapshot.js';
export * from './lib/firestore/noop-layer.js';
export * as Model from './lib/firestore/model/index.js';
export * as Query from './lib/firestore/query/index.js';
export type { QueryConstraint } from './lib/firestore/query/constraints.js';

// --- Portability re-exports (fixes downstream TS2742) ---
//
// The inferred public types produced by `Model.*` reference the Firestore
// schema classes below (via `Schema.instanceOf`) and a handful of
// `@effect/experimental` `VariantSchema` types. Under pnpm's default
// (symlinked, non-hoisted) `node_modules` layout those symbols are only
// reachable through non-portable paths — `effect-firebase/dist/lib/...`
// internals or the `@effect/experimental` virtual store — which makes
// downstream declaration emit (`tsc --emitDeclarationOnly`) fail with TS2742.
//
// Re-exporting them here as *named* bindings lets consumers name them via the
// bare `effect-firebase` specifier instead. NOTE: namespace re-exports
// (`export * as ...`) are NOT sufficient for TS2742 — TypeScript only treats
// direct named bindings as portable names, which is why these are listed
// explicitly even though they are also available under `FirestoreSchema`.

// Firestore schema classes whose instances appear in inferred `Model.*` types.
export {
  Reference,
  Timestamp,
  ServerTimestamp,
  GeoPoint,
} from './lib/firestore/schema/schema.js';

// Firestore field sentinel classes whose instances appear in inferred
// `Model.*` types (e.g. `Model.Array`, `Model.WithArrayFields`,
// `Model.OptionalDeletable`).
export {
  Delete,
  ArrayUnion,
  ArrayRemove,
} from './lib/firestore/fields/fields.js';

// `@effect/experimental` `VariantSchema` types that surface in the inferred
// types of `Model.Class`, `Model.Reference`, `Model.Field`, the date/time and
// optional field helpers, etc. Exposed under `VariantSchema*` aliases so that
// downstream packages do not need a direct dependency on `@effect/experimental`
// to name them.
export type {
  Field as VariantSchemaField,
  Class as VariantSchemaClass,
  Struct as VariantSchemaStruct,
  Union as VariantSchemaUnion,
  ExtractFields as VariantSchemaExtractFields,
  Extract as VariantSchemaExtract,
  fromKey as VariantSchemaFromKey,
  Overrideable as VariantSchemaOverrideable,
  TypeId as VariantSchemaTypeId,
} from '@effect/experimental/VariantSchema';
