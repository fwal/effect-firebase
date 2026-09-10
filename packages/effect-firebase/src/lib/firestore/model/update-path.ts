import { Option, Schema, SchemaAST } from 'effect';

/**
 * How many map levels a dotted field path may descend below a top-level
 * field: `'a.b'` is depth 1, `'a.b.c'` depth 2. Applied identically at the
 * type level ({@link UpdateData}) and at runtime ({@link resolveFieldPath}),
 * so a path the type accepts always resolves and vice versa.
 *
 * The cap is what lets `UpdateData` be computed for recursive schemas
 * (`Schema.suspend`) without TypeScript reporting a circular mapped type,
 * and it bounds type-checking cost on wide models. Firestore itself allows
 * 20 levels; anything deeper than this cap can still be written through
 * `FirestoreService.update`.
 */
export const MAX_FIELD_PATH_DEPTH = 5;

/**
 * The payload accepted by {@link Repository.update}: any subset of the
 * model's `update` fields, plus Firestore dot-separated field paths into
 * nested maps (`'metaData.deleted': true`).
 *
 * A dotted key updates just that nested field and leaves its siblings
 * untouched. A whole-field key (`metaData: { ... }`) replaces the entire
 * map, exactly as the Firestore SDKs do, so nested values under whole-field
 * keys must be complete.
 *
 * Paths descend through plain object types (`Schema.Struct`, `Model.Struct`,
 * `Schema.Class`, `Schema.Record`, `Schema.suspend`) and through `Option`
 * (so an `OptionalDeletable` map is reachable even when currently absent),
 * up to {@link MAX_FIELD_PATH_DEPTH} levels. They stop at arrays,
 * `DateTime`, `Timestamp`, `GeoPoint`, `Reference` and sentinel classes,
 * which are written whole. Recursive types declared as interfaces (the usual
 * pattern for `Schema.suspend`) are leaves at the type level, since
 * interfaces have no implicit index signature; declare them as type aliases
 * to get typed paths into them.
 */
export type UpdateData<T> = FieldPathRecord<T>;

/**
 * Every addressable field of `T` as a key: its own keys plus dotted paths
 * into nested maps (see {@link UpdateData} for what is descended), each
 * mapped to the type found at that path. Shared by `update` payloads and by
 * typed `Query.where`/`Query.orderBy` field names.
 */
export type FieldPathRecord<T> = Partial<T> &
  NestedUpdateFields<T, typeof MAX_FIELD_PATH_DEPTH>;

/** The field names and dotted field paths of `T`. */
export type FieldPaths<T> = keyof FieldPathRecord<T> & string;

/** The type stored at field name or dotted path `P` of `T`. */
export type FieldPathType<T, P extends string> =
  P extends FieldPaths<T> ? Exclude<FieldPathRecord<T>[P], undefined> : never;

type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

/** Decrement table for the depth counter. */
type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

type NestedUpdateFields<T, D extends number> = [D] extends [0]
  ? unknown
  : UnionToIntersection<
      {
        [K in keyof T & string]: ChildUpdateFields<K, T[K], Prev[D]>;
      }[keyof T & string]
    >;

// Interfaces and class instances (DateTime, Option, Timestamp, sentinels…)
// lack an implicit index signature, so they fail `Record<string, unknown>`
// and are treated as leaves; struct types and records pass and are descended.
type ChildUpdateFields<K extends string, V, D extends number> =
  V extends Option.Option<infer U>
    ? ChildUpdateFields<K, U, D>
    : V extends Record<string, unknown>
      ? AddPrefixToKeys<K, Partial<V> & NestedUpdateFields<V, D>>
      : never;

type AddPrefixToKeys<Prefix extends string, T> = {
  [K in keyof T & string as `${Prefix}.${K}`]?: T[K];
};

/**
 * Follow a codec's encoding chain to the AST on its Encoded side. That is
 * where the nested map lives for transformations such as
 * `OptionFromUndefinedOr(Struct)`, whose Type side is an opaque `Option`
 * declaration. Nodes reached this way are still full codecs, so leaves found
 * below them encode correctly. This assumes the transformation keeps keys in
 * place, which every combinator in this library does.
 */
const encodedSide = (ast: SchemaAST.AST): SchemaAST.AST =>
  ast.encoding === undefined
    ? ast
    : encodedSide(ast.encoding[ast.encoding.length - 1].to);

/**
 * Find the AST for a single child key of `ast`, unwrapping the nodes a
 * nested map may be declared through.
 */
const child = (
  ast: SchemaAST.AST,
  key: string,
): Option.Option<SchemaAST.AST> => {
  const node = encodedSide(ast);
  switch (node._tag) {
    case 'Objects': {
      const property = node.propertySignatures.find((p) => p.name === key);
      if (property !== undefined) return Option.some(property.type);
      // A record admits any key its key schema accepts; a segment the key
      // schema rejects (e.g. a template literal or branded key) is not a
      // field, so the caller rejects it like any undeclared key.
      const index = node.indexSignatures.find((i) =>
        Schema.is(Schema.make<Schema.Schema<unknown>>(i.parameter))(key),
      );
      return index === undefined ? Option.none() : Option.some(index.type);
    }
    case 'Union': {
      for (const member of node.types) {
        const found = child(member, key);
        if (Option.isSome(found)) return found;
      }
      return Option.none();
    }
    case 'Suspend':
      return child(node.thunk(), key);
    case 'Declaration':
      // `Schema.Class` is a declaration over the struct of its fields. Other
      // declarations (DateTime, Timestamp, sentinels…) have no children or
      // were unwrapped to their encoded side above.
      return node.typeParameters.length === 1
        ? child(node.typeParameters[0], key)
        : Option.none();
    default:
      return Option.none();
  }
};

/**
 * Resolve a Firestore field path (`'a.b.c'`) against a schema to the schema
 * of the leaf it names. `None` when any segment is not a declared field or
 * the path exceeds {@link MAX_FIELD_PATH_DEPTH}, so the caller can reject
 * the key instead of dropping it.
 */
export const resolveFieldPath = (
  root: Schema.Top,
  path: string,
): Option.Option<Schema.Top> => {
  const segments = path.split('.');
  if (segments.length - 1 > MAX_FIELD_PATH_DEPTH) return Option.none();
  return Option.map(
    segments.reduce<Option.Option<SchemaAST.AST>>(
      (current, segment) =>
        Option.flatMap(current, (ast) => child(ast, segment)),
      Option.some(root.ast),
    ),
    (ast) => Schema.make<Schema.Top>(ast),
  );
};

/**
 * The payload accepted by {@link Repository.update} with `{ merge: true }`:
 * a deep partial of the model's `update` fields. Nested plain objects are
 * flattened into dotted field paths before the write, so every present leaf
 * is written and every absent sibling is left untouched. Leaves are the same
 * as for {@link UpdateData}: arrays, class instances and sentinels are
 * written whole. `Option.some(x)` is merged into; `Option.none()` is a leaf.
 */
export type MergeUpdateData<T> = {
  readonly [K in keyof T]?: MergeValue<T[K]>;
};

type MergeValue<V> =
  V extends Option.Option<infer U>
    ? Option.Option<MergeValue<U>>
    : V extends Record<string, unknown>
      ? MergeUpdateData<V>
      : V;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * Flatten a merge payload into dotted field paths. Plain objects (and the
 * contents of `Option.some`) are descended; everything else is a leaf and is
 * kept as-is, `Option.some(leaf)` included, so the leaf encoder still sees the
 * `Option`. An empty object contributes no paths: writing an empty map would
 * clobber the existing one, which is the opposite of a merge.
 */
export const flattenForMerge = (
  data: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  const visit = (value: unknown, path: string): void => {
    const inner =
      Option.isOption(value) && Option.isSome(value) ? value.value : value;
    if (isPlainObject(inner)) {
      for (const [key, child] of Object.entries(inner)) {
        visit(child, `${path}.${key}`);
      }
      return;
    }
    out[path] = value;
  };
  for (const [key, value] of Object.entries(data)) visit(value, key);
  return out;
};

/** Whether a payload key is a Firestore dotted field path. */
export const isFieldPath = (key: string): boolean => key.includes('.');
