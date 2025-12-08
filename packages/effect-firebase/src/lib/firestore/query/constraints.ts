import { Data } from 'effect';

// ============================================================================
// Where Operators
// ============================================================================

/**
 * Firestore comparison operators for where clauses.
 */
export type WhereFilterOp =
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'array-contains'
  | 'array-contains-any'
  | 'in'
  | 'not-in';

/**
 * Direction for ordering query results.
 */
export type OrderByDirection = 'asc' | 'desc';

// ============================================================================
// Constraint Types (Data classes for structural equality)
// ============================================================================

/**
 * A where constraint that filters documents by field value.
 */
export class Where extends Data.TaggedClass('Where')<{
  readonly field: string;
  readonly op: WhereFilterOp;
  readonly value: unknown;
}> {}

/**
 * An orderBy constraint that sorts documents by field.
 */
export class OrderBy extends Data.TaggedClass('OrderBy')<{
  readonly field: string;
  readonly direction: OrderByDirection;
}> {}

/**
 * A limit constraint that caps the number of results.
 */
export class Limit extends Data.TaggedClass('Limit')<{
  readonly count: number;
}> {}

/**
 * A limitToLast constraint that caps the number of results from the end.
 */
export class LimitToLast extends Data.TaggedClass('LimitToLast')<{
  readonly count: number;
}> {}

/**
 * A startAt cursor constraint for pagination.
 */
export class StartAt extends Data.TaggedClass('StartAt')<{
  readonly values: ReadonlyArray<unknown>;
}> {}

/**
 * A startAfter cursor constraint for pagination.
 */
export class StartAfter extends Data.TaggedClass('StartAfter')<{
  readonly values: ReadonlyArray<unknown>;
}> {}

/**
 * An endAt cursor constraint for pagination.
 */
export class EndAt extends Data.TaggedClass('EndAt')<{
  readonly values: ReadonlyArray<unknown>;
}> {}

/**
 * An endBefore cursor constraint for pagination.
 */
export class EndBefore extends Data.TaggedClass('EndBefore')<{
  readonly values: ReadonlyArray<unknown>;
}> {}

/**
 * An AND composite constraint that combines multiple constraints.
 */
export class And extends Data.TaggedClass('And')<{
  readonly constraints: ReadonlyArray<QueryConstraint>;
}> {}

/**
 * An OR composite constraint that combines multiple filter constraints.
 */
export class Or extends Data.TaggedClass('Or')<{
  readonly constraints: ReadonlyArray<QueryConstraint>;
}> {}

// ============================================================================
// Union Types
// ============================================================================

/**
 * Filter constraints that can be used in OR queries.
 */
export type FilterConstraint = Where | And | Or;

/**
 * All possible query constraints.
 */
export type QueryConstraint =
  | Where
  | OrderBy
  | Limit
  | LimitToLast
  | StartAt
  | StartAfter
  | EndAt
  | EndBefore
  | And
  | Or;
