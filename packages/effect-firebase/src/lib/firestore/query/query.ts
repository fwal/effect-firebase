import {
  And,
  EndAt,
  EndBefore,
  Limit,
  LimitToLast,
  Or,
  OrderBy,
  type OrderByDirection,
  type QueryConstraint,
  StartAfter,
  StartAt,
  Where,
  type WhereFilterOp,
} from './constraints.js';

// ============================================================================
// Type-Safe Field Extraction
// ============================================================================

/**
 * Extract field keys from a Schema struct (Model).
 */
export type FieldKeys<S> = S extends { readonly fields: infer F }
  ? keyof F & string
  : never;

/**
 * Extract the type of a specific field from a Schema.
 */
export type FieldType<S, K extends string> = S extends {
  readonly Type: infer T;
}
  ? K extends keyof T
    ? T[K]
    : never
  : never;

// ============================================================================
// Query Builder Type
// ============================================================================

/**
 * A query is simply an array of constraints.
 * This branded type helps with type inference.
 */
export type Query<S> = ReadonlyArray<QueryConstraint> & {
  readonly _schema?: S;
};

/**
 * Create an empty query.
 */
export const empty = <S>(): Query<S> => [] as Query<S>;

// ============================================================================
// Type-Safe Query Constructors
// ============================================================================

/**
 * Create a where constraint with type-safe field names and values.
 *
 * @example
 * ```ts
 * // Type-safe: field must exist on the model, value must match field type
 * Query.where<PostModel, 'status'>('status', '==', 'active')
 *
 * // Or let TypeScript infer from usage context
 * Query.where('status', '==', 'active')
 * ```
 */
export const where = <S, K extends FieldKeys<S> = string & FieldKeys<S>>(
  field: K,
  op: WhereFilterOp,
  value: FieldType<S, K>
): Query<S> => [new Where({ field, op, value })] as Query<S>;

/**
 * Create an orderBy constraint with type-safe field names.
 *
 * @example
 * ```ts
 * Query.orderBy('createdAt', 'desc')
 * Query.orderBy('name') // defaults to 'asc'
 * ```
 */
export const orderBy = <S, K extends FieldKeys<S> = string & FieldKeys<S>>(
  field: K,
  direction: OrderByDirection = 'asc'
): Query<S> => [new OrderBy({ field, direction })] as Query<S>;

/**
 * Create a limit constraint.
 *
 * @example
 * ```ts
 * Query.limit(10)
 * ```
 */
export const limit = <S>(count: number): Query<S> =>
  [new Limit({ count })] as Query<S>;

/**
 * Create a limitToLast constraint.
 *
 * @example
 * ```ts
 * Query.limitToLast(10)
 * ```
 */
export const limitToLast = <S>(count: number): Query<S> =>
  [new LimitToLast({ count })] as Query<S>;

/**
 * Create a startAt cursor constraint.
 *
 * @example
 * ```ts
 * Query.startAt(lastTimestamp)
 * ```
 */
export const startAt = <S>(...values: ReadonlyArray<unknown>): Query<S> =>
  [new StartAt({ values })] as Query<S>;

/**
 * Create a startAfter cursor constraint.
 *
 * @example
 * ```ts
 * Query.startAfter(lastTimestamp)
 * ```
 */
export const startAfter = <S>(...values: ReadonlyArray<unknown>): Query<S> =>
  [new StartAfter({ values })] as Query<S>;

/**
 * Create an endAt cursor constraint.
 *
 * @example
 * ```ts
 * Query.endAt(maxTimestamp)
 * ```
 */
export const endAt = <S>(...values: ReadonlyArray<unknown>): Query<S> =>
  [new EndAt({ values })] as Query<S>;

/**
 * Create an endBefore cursor constraint.
 *
 * @example
 * ```ts
 * Query.endBefore(maxTimestamp)
 * ```
 */
export const endBefore = <S>(...values: ReadonlyArray<unknown>): Query<S> =>
  [new EndBefore({ values })] as Query<S>;

// ============================================================================
// Composite Constraints
// ============================================================================

/**
 * Combine multiple constraints with AND logic.
 *
 * @example
 * ```ts
 * Query.and(
 *   Query.where('status', '==', 'active'),
 *   Query.where('age', '>=', 18),
 *   Query.orderBy('createdAt', 'desc')
 * )
 * ```
 */
export const and = <S>(...queries: ReadonlyArray<Query<S>>): Query<S> => {
  const constraints = queries.flat();
  // If all constraints are simple (no nested And/Or), just return them flat
  // Otherwise wrap in And
  const hasComposite = constraints.some(
    (c) => c._tag === 'And' || c._tag === 'Or'
  );
  if (hasComposite) {
    return [new And({ constraints })] as Query<S>;
  }
  return constraints as Query<S>;
};

/**
 * Combine multiple filter constraints with OR logic.
 *
 * @example
 * ```ts
 * Query.or(
 *   Query.where('status', '==', 'active'),
 *   Query.where('status', '==', 'pending')
 * )
 * ```
 */
export const or = <S>(...queries: ReadonlyArray<Query<S>>): Query<S> => {
  const constraints = queries.flat();
  return [new Or({ constraints })] as Query<S>;
};

// ============================================================================
// Pipeable Combinators
// ============================================================================

/**
 * Pipeable version of where that appends to an existing query.
 *
 * @example
 * ```ts
 * pipe(
 *   Query.where('status', '==', 'active'),
 *   Query.addWhere('age', '>=', 18)
 * )
 * ```
 */
export const addWhere =
  <S, K extends FieldKeys<S> = string & FieldKeys<S>>(
    field: K,
    op: WhereFilterOp,
    value: FieldType<S, K>
  ) =>
  (query: Query<S>): Query<S> =>
    [...query, new Where({ field, op, value })] as Query<S>;

/**
 * Pipeable version of orderBy that appends to an existing query.
 *
 * @example
 * ```ts
 * pipe(
 *   Query.where('status', '==', 'active'),
 *   Query.addOrderBy('createdAt', 'desc')
 * )
 * ```
 */
export const addOrderBy =
  <S, K extends FieldKeys<S> = string & FieldKeys<S>>(
    field: K,
    direction: OrderByDirection = 'asc'
  ) =>
  (query: Query<S>): Query<S> =>
    [...query, new OrderBy({ field, direction })] as Query<S>;

/**
 * Pipeable version of limit that appends to an existing query.
 *
 * @example
 * ```ts
 * pipe(
 *   Query.where('status', '==', 'active'),
 *   Query.addLimit(10)
 * )
 * ```
 */
export const addLimit =
  (count: number) =>
  <S>(query: Query<S>): Query<S> =>
    [...query, new Limit({ count })] as Query<S>;

/**
 * Pipeable version of limitToLast that appends to an existing query.
 */
export const addLimitToLast =
  (count: number) =>
  <S>(query: Query<S>): Query<S> =>
    [...query, new LimitToLast({ count })] as Query<S>;

/**
 * Pipeable version of startAt that appends to an existing query.
 */
export const addStartAt =
  (...values: ReadonlyArray<unknown>) =>
  <S>(query: Query<S>): Query<S> =>
    [...query, new StartAt({ values })] as Query<S>;

/**
 * Pipeable version of startAfter that appends to an existing query.
 */
export const addStartAfter =
  (...values: ReadonlyArray<unknown>) =>
  <S>(query: Query<S>): Query<S> =>
    [...query, new StartAfter({ values })] as Query<S>;

/**
 * Pipeable version of endAt that appends to an existing query.
 */
export const addEndAt =
  (...values: ReadonlyArray<unknown>) =>
  <S>(query: Query<S>): Query<S> =>
    [...query, new EndAt({ values })] as Query<S>;

/**
 * Pipeable version of endBefore that appends to an existing query.
 */
export const addEndBefore =
  (...values: ReadonlyArray<unknown>) =>
  <S>(query: Query<S>): Query<S> =>
    [...query, new EndBefore({ values })] as Query<S>;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract the raw constraints from a query.
 */
export const toConstraints = <S>(
  query: Query<S>
): ReadonlyArray<QueryConstraint> => query;
