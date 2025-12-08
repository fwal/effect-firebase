import {
  getFirestore,
  Query,
  CollectionReference,
  Filter,
  DocumentData,
} from 'firebase-admin/firestore';
import type { QueryConstraint } from 'effect-firebase';
import { toFirestoreDocumentData } from './converter.js';

/**
 * Helper to convert unknown value to DocumentData for Firestore.
 */
const convertValue = (value: unknown): unknown =>
  toFirestoreDocumentData(value as DocumentData);

/**
 * Convert a single query constraint to Firebase Admin SDK query constraint.
 */
const applyConstraint = (query: Query, constraint: QueryConstraint): Query => {
  switch (constraint._tag) {
    case 'Where':
      return query.where(
        constraint.field,
        constraint.op,
        convertValue(constraint.value)
      );
    case 'OrderBy':
      return query.orderBy(constraint.field, constraint.direction);
    case 'Limit':
      return query.limit(constraint.count);
    case 'LimitToLast':
      return query.limitToLast(constraint.count);
    case 'StartAt':
      return query.startAt(...constraint.values.map(convertValue));
    case 'StartAfter':
      return query.startAfter(...constraint.values.map(convertValue));
    case 'EndAt':
      return query.endAt(...constraint.values.map(convertValue));
    case 'EndBefore':
      return query.endBefore(...constraint.values.map(convertValue));
    case 'And':
      return query.where(buildCompositeFilter(constraint));
    case 'Or':
      return query.where(buildCompositeFilter(constraint));
  }
};

/**
 * Build a composite filter (AND/OR) from constraint.
 */
const buildCompositeFilter = (
  constraint: QueryConstraint & { _tag: 'And' | 'Or' }
): Filter => {
  const filters = constraint.constraints.map(buildFilter);

  if (constraint._tag === 'Or') {
    return Filter.or(...filters);
  }
  return Filter.and(...filters);
};

/**
 * Build a filter from a single constraint.
 */
const buildFilter = (constraint: QueryConstraint): Filter => {
  switch (constraint._tag) {
    case 'Where':
      return Filter.where(
        constraint.field,
        constraint.op,
        convertValue(constraint.value)
      );
    case 'And':
      return Filter.and(...constraint.constraints.map(buildFilter));
    case 'Or':
      return Filter.or(...constraint.constraints.map(buildFilter));
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
  collectionPath: string,
  constraints: ReadonlyArray<QueryConstraint>
): Query => {
  const collectionRef: CollectionReference =
    getFirestore().collection(collectionPath);

  // Separate composite filters from other constraints
  const compositeFilters = constraints.filter(isCompositeFilter);
  const otherConstraints = constraints.filter((c) => !isCompositeFilter(c));

  let query: Query = collectionRef;

  // Apply composite filters first (there should be at most one top-level composite)
  for (const filter of compositeFilters) {
    query = query.where(buildCompositeFilter(filter));
  }

  // Apply other constraints
  for (const constraint of otherConstraints) {
    query = applyConstraint(query, constraint);
  }

  return query;
};
