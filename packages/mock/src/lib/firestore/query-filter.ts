import { Query, Snapshot, type QueryConstraint } from 'effect-firebase';
import {
  compare,
  equals,
  fieldValue,
  sameType,
  type DocData,
} from './value.js';

type Filter = Query.Where | Query.And | Query.Or;

const isFilter = (constraint: QueryConstraint): constraint is Filter =>
  constraint._tag === 'Where' ||
  constraint._tag === 'And' ||
  constraint._tag === 'Or';

const matchesWhere = (data: DocData, where: Query.Where): boolean => {
  const value = fieldValue(data, where.field);
  switch (where.op) {
    case '==':
      return value !== undefined && equals(value, where.value);
    case '!=':
      // Firestore excludes null and missing field values from every `!=`
      // clause (`x != null` is undefined), so `!=` only matches present,
      // non-null field values that are not equal to the comparison value.
      if (value === null || value === undefined) {
        return false;
      }
      return !equals(value, where.value);
    case '<':
    case '<=':
    case '>':
    case '>=': {
      if (value === undefined || !sameType(value, where.value)) {
        return false;
      }
      // Firestore excludes a NaN field value from range filters entirely: it
      // is never matched by <, <=, >, >= despite its defined total-order
      // position below -Infinity (which only governs orderBy).
      if (typeof value === 'number' && Number.isNaN(value)) {
        return false;
      }
      const diff = compare(value, where.value);
      switch (where.op) {
        case '<':
          return diff < 0;
        case '<=':
          return diff <= 0;
        case '>':
          return diff > 0;
        case '>=':
          return diff >= 0;
      }
      break;
    }
    case 'in': {
      if (value === undefined || !Array.isArray(where.value)) {
        return false;
      }
      // `in` shares the range-scan NaN exclusion: a NaN field value never
      // matches, even with a NaN candidate (unlike `== NaN`, which matches).
      if (typeof value === 'number' && Number.isNaN(value)) {
        return false;
      }
      return where.value.some((candidate) => equals(value, candidate));
    }
    case 'not-in': {
      if (value === undefined || !Array.isArray(where.value)) {
        return false;
      }
      // Firestore excludes null (and missing) field values from `not-in`: a
      // null field "is not null" is undefined, so the doc does not satisfy
      // the "exists, is not null, not in list" requirement. A null comparison
      // value makes the whole query match no documents.
      if (value === null) {
        return false;
      }
      if (where.value.some((candidate) => candidate === null)) {
        return false;
      }
      // `not-in` is the complement of `in` over the same scan, so a NaN field
      // value always matches (it is never considered "in" any candidate list).
      if (typeof value === 'number' && Number.isNaN(value)) {
        return true;
      }
      return !where.value.some((candidate) => equals(value, candidate));
    }
    case 'array-contains':
      return (
        Array.isArray(value) && value.some((item) => equals(item, where.value))
      );
    case 'array-contains-any':
      return (
        Array.isArray(value) &&
        Array.isArray(where.value) &&
        value.some((item) =>
          (where.value as ReadonlyArray<unknown>).some((candidate) =>
            equals(item, candidate),
          ),
        )
      );
  }
  return false;
};

const matchesFilter = (data: DocData, filter: Filter): boolean => {
  switch (filter._tag) {
    case 'Where':
      return matchesWhere(data, filter);
    case 'And':
      return filter.constraints
        .filter(isFilter)
        .every((child) => matchesFilter(data, child));
    case 'Or':
      return filter.constraints
        .filter(isFilter)
        .some((child) => matchesFilter(data, child));
  }
};

/**
 * Whether the orderBy at `index` is the document-name position: an explicit
 * `__name__` orderBy, or the implicit tiebreaker Firestore appends after the
 * last explicit one.
 */
const isNamePosition = (
  orderBys: ReadonlyArray<Query.OrderBy>,
  index: number,
): boolean =>
  index === orderBys.length ||
  orderBys[index]?.field === Query.documentIdFieldPath;

const orderValues = (
  snapshot: Snapshot,
  orderBys: ReadonlyArray<Query.OrderBy>,
): ReadonlyArray<unknown> => {
  const [ref, data] = snapshot;
  // The __name__ sentinel (Query.orderByDocumentId) resolves to the full
  // document reference, so documents with the same ID under different
  // parents (as in a collection group) still order deterministically.
  const values = orderBys.map((orderBy) =>
    orderBy.field === Query.documentIdFieldPath
      ? ref.path
      : fieldValue(data, orderBy.field),
  );
  // Firestore implicitly orders by document name as the final tiebreaker.
  return [...values, ref.path];
};

/**
 * Collect the orderBys and cursor arrays out of a constraint list.
 */
const cursorsOf = (
  constraints: ReadonlyArray<QueryConstraint>,
): {
  readonly orderBys: ReadonlyArray<Query.OrderBy>;
  readonly cursors: ReadonlyArray<ReadonlyArray<unknown>>;
} => {
  const orderBys: Array<Query.OrderBy> = [];
  const cursors: Array<ReadonlyArray<unknown>> = [];
  for (const constraint of constraints) {
    switch (constraint._tag) {
      case 'OrderBy':
        orderBys.push(constraint);
        break;
      case 'StartAt':
      case 'StartAfter':
      case 'EndAt':
      case 'EndBefore':
        cursors.push(constraint.values);
        break;
    }
  }
  return { orderBys, cursors };
};

/**
 * Validate the document-name cursor values of a **collection group** query,
 * returning an error message when one is not a full document path. Both
 * SDKs reject a bare ID there, since it does not name a document without
 * knowing which parent it belongs to.
 */
export const validateGroupCursors = (
  constraints: ReadonlyArray<QueryConstraint>,
): string | undefined => {
  const { orderBys, cursors } = cursorsOf(constraints);
  for (const cursor of cursors) {
    // Firestore allows one value per orderBy, plus the implicit document-name
    // tiebreaker when the query does not already order by __name__ itself.
    // Anything beyond that is rejected by both SDKs.
    const maxValues = orderBys.some(
      (orderBy) => orderBy.field === Query.documentIdFieldPath,
    )
      ? orderBys.length
      : orderBys.length + 1;
    if (cursor.length > maxValues) {
      return 'Too many cursor values specified. The specified values must match the orderBy() constraints of the query';
    }
    for (let i = 0; i < cursor.length; i++) {
      if (!isNamePosition(orderBys, i)) {
        continue;
      }
      const value = cursor[i];
      const segments = typeof value === 'string' ? value.split('/') : [];
      const isDocumentPath =
        segments.length >= 2 &&
        segments.length % 2 === 0 &&
        segments.every((segment) => segment.length > 0);
      if (!isDocumentPath) {
        return `When querying a collection group and ordering by document ID, the cursor value must be a full document path, but '${String(
          value,
        )}' is not`;
      }
    }
  }
  return undefined;
};

/**
 * Resolve a cursor value at a document-name position. A single-collection
 * query takes a bare ID, which Firestore expands against that collection;
 * the mock expands it against the snapshot's own parent. A collection group
 * query only ever reaches here with full paths (see
 * {@link validateGroupCursors}).
 */
const nameCursor = (snapshot: Snapshot, value: unknown): unknown => {
  if (typeof value !== 'string' || value.includes('/')) {
    return value;
  }
  const [ref] = snapshot;
  return `${ref.path.slice(0, ref.path.length - ref.id.length)}${value}`;
};

const compareSnapshots = (
  orderBys: ReadonlyArray<Query.OrderBy>,
): ((a: Snapshot, b: Snapshot) => number) => {
  const directions = [...orderBys.map((o) => o.direction), 'asc' as const];
  return (a, b) => {
    const aValues = orderValues(a, orderBys);
    const bValues = orderValues(b, orderBys);
    for (let i = 0; i < aValues.length; i++) {
      const diff = compare(aValues[i], bValues[i]);
      if (diff !== 0) {
        return directions[i] === 'desc' ? -diff : diff;
      }
    }
    return 0;
  };
};

const compareCursor = (
  snapshot: Snapshot,
  cursor: ReadonlyArray<unknown>,
  orderBys: ReadonlyArray<Query.OrderBy>,
): number => {
  const values = orderValues(snapshot, orderBys);
  for (let i = 0; i < Math.min(cursor.length, values.length); i++) {
    const direction = orderBys[i]?.direction ?? 'asc';
    const expected = isNamePosition(orderBys, i)
      ? nameCursor(snapshot, cursor[i])
      : cursor[i];
    const diff = compare(values[i], expected);
    if (diff !== 0) {
      return direction === 'desc' ? -diff : diff;
    }
  }
  return 0;
};

/**
 * Evaluate query constraints against a collection of snapshots, following
 * Firestore's filtering, ordering, cursor and limit semantics.
 */
export const applyConstraints = (
  snapshots: ReadonlyArray<Snapshot>,
  constraints: ReadonlyArray<QueryConstraint>,
): ReadonlyArray<Snapshot> => {
  const filters: Array<Filter> = [];
  const orderBys: Array<Query.OrderBy> = [];
  let limit: number | undefined;
  let limitToLast: number | undefined;
  let startAt: ReadonlyArray<unknown> | undefined;
  let startAfter: ReadonlyArray<unknown> | undefined;
  let endAt: ReadonlyArray<unknown> | undefined;
  let endBefore: ReadonlyArray<unknown> | undefined;

  for (const constraint of constraints) {
    switch (constraint._tag) {
      case 'Where':
      case 'And':
      case 'Or':
        filters.push(constraint);
        break;
      case 'OrderBy':
        orderBys.push(constraint);
        break;
      case 'Limit':
        limit = constraint.count;
        break;
      case 'LimitToLast':
        limitToLast = constraint.count;
        break;
      case 'StartAt':
        startAt = constraint.values;
        break;
      case 'StartAfter':
        startAfter = constraint.values;
        break;
      case 'EndAt':
        endAt = constraint.values;
        break;
      case 'EndBefore':
        endBefore = constraint.values;
        break;
    }
  }

  // Firestore excludes documents that lack a field named by an orderBy.
  // The __name__ sentinel is exempt: every document has an ID.
  let results = snapshots.filter(
    ([, data]) =>
      filters.every((filter) => matchesFilter(data, filter)) &&
      orderBys.every(
        (orderBy) =>
          orderBy.field === Query.documentIdFieldPath ||
          fieldValue(data, orderBy.field) !== undefined,
      ),
  );

  results = [...results].sort(compareSnapshots(orderBys));

  if (startAt !== undefined) {
    const cursor = startAt;
    results = results.filter(
      (snapshot) => compareCursor(snapshot, cursor, orderBys) >= 0,
    );
  }
  if (startAfter !== undefined) {
    const cursor = startAfter;
    results = results.filter(
      (snapshot) => compareCursor(snapshot, cursor, orderBys) > 0,
    );
  }
  if (endAt !== undefined) {
    const cursor = endAt;
    results = results.filter(
      (snapshot) => compareCursor(snapshot, cursor, orderBys) <= 0,
    );
  }
  if (endBefore !== undefined) {
    const cursor = endBefore;
    results = results.filter(
      (snapshot) => compareCursor(snapshot, cursor, orderBys) < 0,
    );
  }

  // Firestore rejects queries combining `limit()` and `limitToLast()`;
  // the mock applies `limitToLast` and ignores `limit` in that case.
  if (limitToLast !== undefined) {
    results = results.slice(Math.max(0, results.length - limitToLast));
  } else if (limit !== undefined) {
    results = results.slice(0, limit);
  }

  return results;
};
