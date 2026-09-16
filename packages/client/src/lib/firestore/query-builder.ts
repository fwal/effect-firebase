import {
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  limitToLast,
  startAt,
  startAfter,
  endAt,
  endBefore,
  and,
  or,
  Query,
  QueryConstraint as FirebaseQueryConstraint,
  QueryFilterConstraint,
  QueryCompositeFilterConstraint,
  DocumentData,
  Firestore,
} from 'firebase/firestore';
import type { QueryConstraint } from 'effect-firebase';
import { firestoreEncode } from './converter.js';

/**
 * Helper to convert unknown value to DocumentData for Firestore.
 */
const convertValue = (db: Firestore, value: unknown): unknown =>
  firestoreEncode(db, value as DocumentData);

/**
 * Convert a single query constraint to Firebase Client SDK query constraint.
 */
const toFirebaseConstraint = (
  db: Firestore,
  constraint: QueryConstraint,
): FirebaseQueryConstraint | QueryCompositeFilterConstraint => {
  switch (constraint._tag) {
    case 'Where':
      return where(
        constraint.field,
        constraint.op,
        convertValue(db, constraint.value),
      );
    case 'OrderBy':
      return orderBy(constraint.field, constraint.direction);
    case 'Limit':
      return limit(constraint.count);
    case 'LimitToLast':
      return limitToLast(constraint.count);
    case 'StartAt':
      return startAt(
        ...constraint.values.map((value) => convertValue(db, value)),
      );
    case 'StartAfter':
      return startAfter(
        ...constraint.values.map((value) => convertValue(db, value)),
      );
    case 'EndAt':
      return endAt(
        ...constraint.values.map((value) => convertValue(db, value)),
      );
    case 'EndBefore':
      return endBefore(
        ...constraint.values.map((value) => convertValue(db, value)),
      );
    case 'And':
      return and(
        ...constraint.constraints.map((child) => toFilterConstraint(db, child)),
      );
    case 'Or':
      return or(
        ...constraint.constraints.map((child) => toFilterConstraint(db, child)),
      );
  }
};

/**
 * Convert a constraint to a filter constraint (for use in and/or).
 */
const toFilterConstraint = (
  db: Firestore,
  constraint: QueryConstraint,
): QueryFilterConstraint => {
  switch (constraint._tag) {
    case 'Where':
      return where(
        constraint.field,
        constraint.op,
        convertValue(db, constraint.value),
      );
    case 'And':
      return and(
        ...constraint.constraints.map((child) => toFilterConstraint(db, child)),
      );
    case 'Or':
      return or(
        ...constraint.constraints.map((child) => toFilterConstraint(db, child)),
      );
    default:
      throw new Error(
        `Cannot use ${constraint._tag} inside AND/OR composite filters`,
      );
  }
};

/**
 * Apply constraints to a base query (a collection or collection group).
 */
const applyConstraints = (
  db: Firestore,
  base: Query,
  constraints: ReadonlyArray<QueryConstraint>,
): Query => {
  const firebaseConstraints = constraints.map((constraint) =>
    toFirebaseConstraint(db, constraint),
  );
  // Cast is safe - QueryCompositeFilterConstraint can be used in query()
  return query(base, ...(firebaseConstraints as FirebaseQueryConstraint[]));
};

/**
 * Build a Firebase Client SDK query from a collection path and constraints.
 */
export const buildQuery = (
  db: Firestore,
  collectionPath: string,
  constraints: ReadonlyArray<QueryConstraint>,
): Query => applyConstraints(db, collection(db, collectionPath), constraints);

/**
 * Build a Firebase Client SDK collection group query from a collection ID and
 * constraints.
 */
export const buildCollectionGroupQuery = (
  db: Firestore,
  collectionId: string,
  constraints: ReadonlyArray<QueryConstraint>,
): Query =>
  applyConstraints(db, collectionGroup(db, collectionId), constraints);
