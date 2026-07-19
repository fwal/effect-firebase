import { Query, Snapshot, type QueryConstraint } from 'effect-firebase';
import { compare, equals, fieldValue, sameType, type DocData } from './value.js';

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
      return value !== undefined && !equals(value, where.value);
    case '<':
    case '<=':
    case '>':
    case '>=': {
      if (value === undefined || !sameType(value, where.value)) {
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
    case 'in':
      return (
        value !== undefined &&
        Array.isArray(where.value) &&
        where.value.some((candidate) => equals(value, candidate))
      );
    case 'not-in':
      return (
        value !== undefined &&
        Array.isArray(where.value) &&
        !where.value.some((candidate) => equals(value, candidate))
      );
    case 'array-contains':
      return (
        Array.isArray(value) &&
        value.some((item) => equals(item, where.value))
      );
    case 'array-contains-any':
      return (
        Array.isArray(value) &&
        Array.isArray(where.value) &&
        value.some((item) =>
          (where.value as ReadonlyArray<unknown>).some((candidate) =>
            equals(item, candidate)
          )
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

const orderValues = (
  snapshot: Snapshot,
  orderBys: ReadonlyArray<Query.OrderBy>
): ReadonlyArray<unknown> => {
  const [ref, data] = snapshot;
  const values = orderBys.map((orderBy) => fieldValue(data, orderBy.field));
  // Firestore implicitly orders by document ID as the final tiebreaker.
  return [...values, ref.id];
};

const compareSnapshots = (
  orderBys: ReadonlyArray<Query.OrderBy>
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
  orderBys: ReadonlyArray<Query.OrderBy>
): number => {
  const values = orderValues(snapshot, orderBys);
  for (let i = 0; i < Math.min(cursor.length, values.length); i++) {
    const direction = orderBys[i]?.direction ?? 'asc';
    const diff = compare(values[i], cursor[i]);
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
  constraints: ReadonlyArray<QueryConstraint>
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

  let results = snapshots.filter(([, data]) =>
    filters.every((filter) => matchesFilter(data, filter))
  );

  results = [...results].sort(compareSnapshots(orderBys));

  if (startAt !== undefined) {
    const cursor = startAt;
    results = results.filter(
      (snapshot) => compareCursor(snapshot, cursor, orderBys) >= 0
    );
  }
  if (startAfter !== undefined) {
    const cursor = startAfter;
    results = results.filter(
      (snapshot) => compareCursor(snapshot, cursor, orderBys) > 0
    );
  }
  if (endAt !== undefined) {
    const cursor = endAt;
    results = results.filter(
      (snapshot) => compareCursor(snapshot, cursor, orderBys) <= 0
    );
  }
  if (endBefore !== undefined) {
    const cursor = endBefore;
    results = results.filter(
      (snapshot) => compareCursor(snapshot, cursor, orderBys) < 0
    );
  }

  if (limit !== undefined) {
    results = results.slice(0, limit);
  }
  if (limitToLast !== undefined) {
    results = results.slice(Math.max(0, results.length - limitToLast));
  }

  return results;
};
