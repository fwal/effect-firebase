import {
  Query,
  CollectionReference,
  Filter,
  DocumentData,
  Firestore,
} from 'firebase-admin/firestore';
import type { QueryConstraint } from 'effect-firebase';
import { toFirestoreDocumentData } from './converter.js';

/**
 * Helper to convert unknown value to DocumentData for Firestore.
 */
const convertValue = (db: Firestore, value: unknown): unknown =>
  toFirestoreDocumentData(db, value as DocumentData);

/**
 * Convert a single query constraint to Firebase Admin SDK query constraint.
 */
const applyConstraint = (
  db: Firestore,
  query: Query,
  constraint: QueryConstraint
): Query => {
  switch (constraint._tag) {
    case 'Where':
      return query.where(
        constraint.field,
        constraint.op,
        convertValue(db, constraint.value)
      );
    case 'OrderBy':
      return query.orderBy(constraint.field, constraint.direction);
    case 'Limit':
      return query.limit(constraint.count);
    case 'LimitToLast':
      return query.limitToLast(constraint.count);
    case 'StartAt':
      return query.startAt(
        ...constraint.values.map((value) => convertValue(db, value))
      );
    case 'StartAfter':
      return query.startAfter(
        ...constraint.values.map((value) => convertValue(db, value))
      );
    case 'EndAt':
      return query.endAt(
        ...constraint.values.map((value) => convertValue(db, value))
      );
    case 'EndBefore':
      return query.endBefore(
        ...constraint.values.map((value) => convertValue(db, value))
      );
    case 'And':
      return query.where(buildCompositeFilter(db, constraint));
    case 'Or':
      return query.where(buildCompositeFilter(db, constraint));
  }
};

/**
 * Build a composite filter (AND/OR) from constraint.
 */
const buildCompositeFilter = (
  db: Firestore,
  constraint: QueryConstraint & { _tag: 'And' | 'Or' }
): Filter => {
  const filters = constraint.constraints.map((childConstraint) =>
    buildFilter(db, childConstraint)
  );

  if (constraint._tag === 'Or') {
    return Filter.or(...filters);
  }
  return Filter.and(...filters);
};

/**
 * Build a filter from a single constraint.
 */
const buildFilter = (db: Firestore, constraint: QueryConstraint): Filter => {
  switch (constraint._tag) {
    case 'Where':
      return Filter.where(
        constraint.field,
        constraint.op,
        convertValue(db, constraint.value)
      );
    case 'And':
      return Filter.and(
        ...constraint.constraints.map((childConstraint) =>
          buildFilter(db, childConstraint)
        )
      );
    case 'Or':
      return Filter.or(
        ...constraint.constraints.map((childConstraint) =>
          buildFilter(db, childConstraint)
        )
      );
    default:
      // Non-filter constraints (OrderBy, Limit, etc.) shouldn't appear in composite filters
      throw new Error(
        `Cannot use ${constraint._tag} inside AND/OR composite filters`
      );
  }
};

/**
 * Check if a constraint is a composite (And/Or) filter.
 */
const isCompositeFilter = (
  constraint: QueryConstraint
): constraint is QueryConstraint & { _tag: 'And' | 'Or' } =>
  constraint._tag === 'And' || constraint._tag === 'Or';

/**
 * Build a Firebase Admin SDK query from a collection path and constraints.
 */
export const buildQuery = (
  db: Firestore,
  collectionPath: string,
  constraints: ReadonlyArray<QueryConstraint>
): Query => {
  const collectionRef: CollectionReference = db.collection(collectionPath);

  // Separate composite filters from other constraints
  const compositeFilters = constraints.filter(isCompositeFilter);
  const otherConstraints = constraints.filter((c) => !isCompositeFilter(c));

  let query: Query = collectionRef;

  // Apply composite filters first (there should be at most one top-level composite)
  for (const filter of compositeFilters) {
    query = query.where(buildCompositeFilter(db, filter));
  }

  // Apply other constraints
  for (const constraint of otherConstraints) {
    query = applyConstraint(db, query, constraint);
  }

  return query;
};
