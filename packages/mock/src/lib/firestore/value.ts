import { Firestore, FirestoreSchema } from 'effect-firebase';

/**
 * Document data as stored by the mock backend: the encoded representation
 * produced by the schema layer (`FirestoreSchema.Timestamp`, `GeoPoint`,
 * `Reference` instances and plain JSON values).
 */
export type DocData = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof FirestoreSchema.Timestamp) &&
  !(value instanceof FirestoreSchema.ServerTimestamp) &&
  !(value instanceof FirestoreSchema.GeoPoint) &&
  !(value instanceof FirestoreSchema.Reference) &&
  !(value instanceof Firestore.Delete) &&
  !(value instanceof Firestore.ArrayUnion) &&
  !(value instanceof Firestore.ArrayRemove);

/**
 * Firestore value type ordering, used when comparing values of different types.
 * @see https://firebase.google.com/docs/firestore/manage-data/data-types#value_type_ordering
 */
const rank = (value: unknown): number => {
  if (value === null) return 0;
  if (typeof value === 'boolean') return 1;
  if (typeof value === 'number') return 2;
  if (value instanceof FirestoreSchema.Timestamp) return 3;
  if (typeof value === 'string') return 4;
  if (value instanceof FirestoreSchema.Reference) return 5;
  if (value instanceof FirestoreSchema.GeoPoint) return 6;
  if (Array.isArray(value)) return 7;
  return 8;
};

const compareNumbers = (a: number, b: number): number =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * Compare two stored values following Firestore's ordering semantics.
 * Values of different types order by type rank.
 */
export const compare = (a: unknown, b: unknown): number => {
  const rankDiff = compareNumbers(rank(a), rank(b));
  if (rankDiff !== 0) {
    return rankDiff;
  }
  if (a === null) {
    return 0;
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return compareNumbers(Number(a), Number(b));
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return compareNumbers(a, b);
  }
  if (
    a instanceof FirestoreSchema.Timestamp &&
    b instanceof FirestoreSchema.Timestamp
  ) {
    return (
      compareNumbers(a.seconds, b.seconds) ||
      compareNumbers(a.nanoseconds, b.nanoseconds)
    );
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (
    a instanceof FirestoreSchema.Reference &&
    b instanceof FirestoreSchema.Reference
  ) {
    return compare(a.path, b.path);
  }
  if (
    a instanceof FirestoreSchema.GeoPoint &&
    b instanceof FirestoreSchema.GeoPoint
  ) {
    return (
      compareNumbers(a.latitude, b.latitude) ||
      compareNumbers(a.longitude, b.longitude)
    );
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i++) {
      const diff = compare(a[i], b[i]);
      if (diff !== 0) {
        return diff;
      }
    }
    return compareNumbers(a.length, b.length);
  }
  if (isRecord(a) && isRecord(b)) {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    const length = Math.min(aKeys.length, bKeys.length);
    for (let i = 0; i < length; i++) {
      const keyDiff = compare(aKeys[i], bKeys[i]);
      if (keyDiff !== 0) {
        return keyDiff;
      }
      const valueDiff = compare(a[aKeys[i]], b[bKeys[i]]);
      if (valueDiff !== 0) {
        return valueDiff;
      }
    }
    return compareNumbers(aKeys.length, bKeys.length);
  }
  return 0;
};

/**
 * Structural equality for stored values.
 */
export const equals = (a: unknown, b: unknown): boolean => compare(a, b) === 0;

/**
 * Whether two values share the same Firestore type rank. Range comparisons
 * (`<`, `<=`, `>`, `>=`) only ever match values of the same type.
 */
export const sameType = (a: unknown, b: unknown): boolean =>
  rank(a) === rank(b);

/**
 * Resolve a (possibly dot-separated) field path against document data.
 * Returns `undefined` when any intermediate segment is missing.
 */
export const fieldValue = (data: DocData, fieldPath: string): unknown => {
  let current: unknown = data;
  for (const segment of fieldPath.split('.')) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
};

/**
 * Recursively materialize sentinel values for storage:
 * `ServerTimestamp` becomes `now`, array sentinels collapse to plain arrays.
 */
const materialize = (value: unknown, now: FirestoreSchema.Timestamp): unknown => {
  if (value instanceof FirestoreSchema.ServerTimestamp) {
    return now;
  }
  if (value instanceof Firestore.ArrayUnion) {
    return dedupe(value.values.map((item) => materialize(item, now)));
  }
  if (value instanceof Firestore.ArrayRemove) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => materialize(item, now));
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item instanceof Firestore.Delete) {
        continue;
      }
      result[key] = materialize(item, now);
    }
    return result;
  }
  return value;
};

const dedupe = (values: ReadonlyArray<unknown>): Array<unknown> => {
  const result: Array<unknown> = [];
  for (const value of values) {
    if (!result.some((existing) => equals(existing, value))) {
      result.push(value);
    }
  }
  return result;
};

const applyField = (
  existing: unknown,
  incoming: unknown,
  now: FirestoreSchema.Timestamp
): unknown => {
  if (incoming instanceof Firestore.ArrayUnion) {
    const base = Array.isArray(existing) ? existing : [];
    const additions = missingFrom(
      base,
      incoming.values.map((item) => materialize(item, now))
    );
    return [...base, ...additions];
  }
  if (incoming instanceof Firestore.ArrayRemove) {
    const base = Array.isArray(existing) ? existing : [];
    const removals = incoming.values.map((item) => materialize(item, now));
    return base.filter(
      (item) => !removals.some((removal) => equals(removal, item))
    );
  }
  return materialize(incoming, now);
};

const missingFrom = (
  base: ReadonlyArray<unknown>,
  additions: ReadonlyArray<unknown>
): Array<unknown> => {
  const result: Array<unknown> = [];
  for (const addition of additions) {
    const present =
      base.some((item) => equals(item, addition)) ||
      result.some((item) => equals(item, addition));
    if (!present) {
      result.push(addition);
    }
  }
  return result;
};

/**
 * Apply a full document write (`add` / `set` without merge).
 */
export const applySet = (
  incoming: DocData,
  now: FirestoreSchema.Timestamp
): DocData => {
  const result: DocData = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (value instanceof Firestore.Delete) {
      continue;
    }
    result[key] = applyField(undefined, value, now);
  }
  return result;
};

const mergeRecords = (
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  now: FirestoreSchema.Timestamp
): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value instanceof Firestore.Delete) {
      delete result[key];
      continue;
    }
    const current = result[key];
    if (isRecord(current) && isRecord(value)) {
      result[key] = mergeRecords(current, value, now);
      continue;
    }
    result[key] = applyField(current, value, now);
  }
  return result;
};

/**
 * Apply a merging write (`set` with `{ merge: true }`).
 */
export const applyMerge = (
  existing: DocData | undefined,
  incoming: DocData,
  now: FirestoreSchema.Timestamp
): DocData => mergeRecords(existing ?? {}, incoming, now);

const setAtPath = (
  data: Record<string, unknown>,
  segments: ReadonlyArray<string>,
  value: unknown,
  now: FirestoreSchema.Timestamp
): Record<string, unknown> => {
  const [head, ...rest] = segments;
  const result = { ...data };
  if (rest.length === 0) {
    if (value instanceof Firestore.Delete) {
      delete result[head];
    } else {
      result[head] = applyField(result[head], value, now);
    }
    return result;
  }
  const current = result[head];
  result[head] = setAtPath(isRecord(current) ? current : {}, rest, value, now);
  return result;
};

/**
 * Apply an `update` write. Keys may contain dot-separated field paths.
 */
export const applyUpdate = (
  existing: DocData,
  incoming: DocData,
  now: FirestoreSchema.Timestamp
): DocData => {
  let result: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    result = setAtPath(result, key.split('.'), value, now);
  }
  return result;
};
