import { Schema } from 'effect';
import { Model, VariantSchema } from 'effect/unstable/schema';
import { IncrementInstance } from '../fields/increment.js';

/**
 * Adds `Increment` sentinel support to a numeric field's `update` variant.
 *
 * The `get`, `add`, and JSON variants keep the original number type unchanged.
 * The `update` variant additionally accepts `Increment` values which are
 * converted to Firestore `FieldValue`s by the client/admin converters.
 *
 * @example
 * ```ts
 * class PostModel extends Class<PostModel>('PostModel')({
 *   id: Schema.String,
 *   likes: Model.WithIncrementField(Schema.Number),
 * }) {}
 *
 * // update variant accepts:
 * postRepo.update('id', { likes: 5 });             // replace
 * postRepo.update('id', { likes: increment(1) });  // increment
 * ```
 */
export type WithIncrementField<S extends Schema.Top> = VariantSchema.Field<{
  readonly select: S;
  readonly insert: S;
  readonly update: Schema.Union<readonly [S, typeof IncrementInstance]>;
  readonly json: S;
  readonly jsonCreate: S;
  readonly jsonUpdate: S;
}>;

const identity = (s: Schema.Top) => s;

export const WithIncrementField: <
  Field extends VariantSchema.Field<any> | Schema.Top,
>(
  self: Field,
) => Field extends Schema.Top
  ? WithIncrementField<Field>
  : Field extends VariantSchema.Field<infer S>
    ? VariantSchema.Field<{
        readonly [K in keyof S]: S[K] extends Schema.Top
          ? K extends 'update'
            ? Schema.Union<readonly [S[K], typeof IncrementInstance]>
            : S[K]
          : never;
      }>
    : never = Model.fieldEvolve({
  select: identity,
  insert: identity,
  update: (s: Schema.Top) => Schema.Union([s, IncrementInstance]),
  json: identity,
  jsonCreate: identity,
  jsonUpdate: identity,
}) as any;

/**
 * Convenience constructor that creates a number field with increment support.
 * Equivalent to `WithIncrementField(Schema.Number)`.
 *
 * @example
 * ```ts
 * class PostModel extends Class<PostModel>('PostModel')({
 *   likes: Model.Number,
 * }) {}
 * ```
 */
export const Number: WithIncrementField<Schema.Number> = WithIncrementField(
  Schema.Number,
) as any;
