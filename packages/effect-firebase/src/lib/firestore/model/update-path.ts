import { Option, Schema } from 'effect';

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
 * `Schema.Class`, `Schema.Record`) and through `Option` (so an
 * `OptionalDeletable` map is reachable even when currently absent). They stop
 * at arrays, `DateTime`, `Timestamp`, `GeoPoint`, `Reference` and sentinel
 * classes, which are written whole.
 */
export type UpdateData<T> = Partial<T> & NestedUpdateFields<T>;

type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

type NestedUpdateFields<T> = UnionToIntersection<
  {
    [K in keyof T & string]: ChildUpdateFields<K, T[K]>;
  }[keyof T & string]
>;

// Interfaces and class instances (DateTime, Option, Timestamp, sentinels…)
// lack an implicit index signature, so they fail `Record<string, unknown>`
// and are treated as leaves; struct types and records pass and are descended.
type ChildUpdateFields<K extends string, V> =
  V extends Option.Option<infer U>
    ? ChildUpdateFields<K, U>
    : V extends Record<string, unknown>
      ? AddPrefixToKeys<K, UpdateData<V>>
      : never;

type AddPrefixToKeys<Prefix extends string, T> = {
  [K in keyof T & string as `${Prefix}.${K}`]?: T[K];
};

/**
 * Structural view of the schema combinators a field path may pass through.
 * These are the public properties `Schema.Struct`, `Schema.Class`,
 * `Schema.optional`/`optionalKey`, `Schema.Union`, `Schema.decodeTo` (and
 * `OptionFromUndefinedOr` etc.) and `Schema.Record` expose. Record
 * segments are checked against the record's key schema.
 */
type Walkable = Schema.Top & {
  readonly fields?: Record<string, Schema.Top>;
  readonly schema?: Schema.Top;
  readonly members?: ReadonlyArray<Schema.Top>;
  readonly from?: Schema.Top;
  readonly key?: Schema.Top;
  readonly value?: Schema.Top;
};

/**
 * Find the schema for a single child key of `schema`, unwrapping the
 * combinators a nested map may be declared through.
 *
 * Transformations (`decodeTo`) are followed on their `from` side: that is
 * the codec that knows how to encode the nested leaf, whereas the `to` side
 * of e.g. `OptionFromUndefinedOr` is the plain in-memory type. This assumes
 * the transformation keeps keys in place, which every combinator in this
 * library does.
 */
const child = (schema: Schema.Top, key: string): Option.Option<Schema.Top> => {
  const s = schema as Walkable;
  if (s.fields !== undefined) {
    const field = s.fields[key];
    return field === undefined ? Option.none() : Option.some(field);
  }
  if (s.key !== undefined && s.value !== undefined) {
    // A Record admits any key its key schema accepts; a segment the key
    // schema rejects (e.g. a template literal or branded key) is not a
    // field, so the caller rejects it like any undeclared key.
    return Schema.is(s.key as Schema.Schema<unknown>)(key)
      ? Option.some(s.value)
      : Option.none();
  }
  if (s.from !== undefined) {
    return child(s.from, key);
  }
  if (s.schema !== undefined) {
    return child(s.schema, key);
  }
  if (s.members !== undefined) {
    for (const member of s.members) {
      const found = child(member, key);
      if (Option.isSome(found)) return found;
    }
  }
  return Option.none();
};

/**
 * Resolve a Firestore field path (`'a.b.c'`) against a struct schema to the
 * schema of the leaf it names. `None` when any segment is not a declared
 * field, so the caller can reject the key instead of dropping it.
 */
export const resolveFieldPath = (
  root: Schema.Top,
  path: string,
): Option.Option<Schema.Top> =>
  path
    .split('.')
    .reduce<Option.Option<Schema.Top>>(
      (current, segment) =>
        Option.flatMap(current, (schema) => child(schema, segment)),
      Option.some(root),
    );

/** Whether a payload key is a Firestore dotted field path. */
export const isFieldPath = (key: string): boolean => key.includes('.');
