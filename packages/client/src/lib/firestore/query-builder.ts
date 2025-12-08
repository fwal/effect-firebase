import {
  getFirestore,
  collection,
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
} from 'firebase/firestore';
import type { QueryConstraint } from 'effect-firebase';
import { toFirestoreDocumentData } from './converter.js';

/**
 * Helper to convert unknown value to DocumentData for Firestore.
 */
const convertValue = (value: unknown): unknown =>
  toFirestoreDocumentData(value as DocumentData);

/**
 * Convert a single query constraint to Firebase Client SDK query constraint.
 */
const toFirebaseConstraint = (
  constraint: QueryConstraint
): FirebaseQueryConstraint | QueryCompositeFilterConstraint => {
  switch (constraint._tag) {
    case 'Where':
      return where(
        constraint.field,
        constraint.op,
        convertValue(constraint.value)
      );
    case 'OrderBy':
      return orderBy(constraint.field, constraint.direction);
    case 'Limit':
      return limit(constraint.count);
    case 'LimitToLast':
      return limitToLast(constraint.count);
    case 'StartAt':
      return startAt(...constraint.values.map(convertValue));
    case 'StartAfter':
      return startAfter(...constraint.values.map(convertValue));
    case 'EndAt':
      return endAt(...constraint.values.map(convertValue));
    case 'EndBefore':
      return endBefore(...constraint.values.map(convertValue));
    case 'And':
      return and(...constraint.constraints.map(toFilterConstraint));
    case 'Or':
      return or(...constraint.constraints.map(toFilterConstraint));
  }
};

/**
 * Convert a constraint to a filter constraint (for use in and/or).
 */
const toFilterConstraint = (
  constraint: QueryConstraint
): QueryFilterConstraint => {
  switch (constraint._tag) {
    case 'Where':
      return where(
        constraint.field,
        constraint.op,
        convertValue(constraint.value)
      );
    case 'And':
      return and(...constraint.constraints.map(toFilterConstraint));
    case 'Or':
      return or(...constraint.constraints.map(toFilterConstraint));
    default:
      throw new Error(
        `Cannot use ${constraint._tag} inside AND/OR composite filters`
      );
  }
};

/**
 * Build a Firebase Client SDK query from a collection path and constraints.
 */
export const buildQuery = (
  collectionPath: string,
  constraints: ReadonlyArray<QueryConstraint>
): Query => {
  const collectionRef = collection(getFirestore(), collectionPath);
  const firebaseConstraints = constraints.map(toFirebaseConstraint);
  // Cast is safe - QueryCompositeFilterConstraint can be used in query()
  return query(
    collectionRef,
    ...(firebaseConstraints as FirebaseQueryConstraint[])
  );
};
