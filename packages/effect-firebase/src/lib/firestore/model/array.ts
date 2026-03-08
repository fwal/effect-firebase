import { Schema } from 'effect';
import { VariantSchema } from '@effect/experimental';
import { fieldEvolve } from './core.js';
import { ArrayUnionInstance, ArrayRemoveInstance } from '../fields/array.js';

/**
 * Adds `ArrayUnion` and `ArrayRemove` sentinel support to an array field's `update` variant.
 *
 * The `get`, `add`, and JSON variants keep the original array type unchanged.
 * The `update` variant additionally accepts `ArrayUnion`  and
 * `ArrayRemove` values which are converted to Firestore
 * `FieldValue`s by the client/admin converters.
 *
 * @example
 * ```ts
 * class PostModel extends Class<PostModel>('PostModel')({
 *   id: Schema.String,
 *   tags: Model.WithArrayFields(Schema.Array(Schema.String)),
 * }) {}
 *
 * // update variant accepts:
 * postRepo.update('id', { tags: ['a', 'b'] });              // replace
 * postRepo.update('id', { tags: arrayUnion(['c']) });    // arrayUnion
 * postRepo.update('id', { tags: arrayRemove(['a']) }); // arrayRemove
 * ```
 */
export type WithArrayFields<S extends Schema.Schema.Any> = VariantSchema.Field<{
  readonly get: S;
  readonly add: S;
  readonly update: Schema.Union<
    [S, typeof ArrayUnionInstance, typeof ArrayRemoveInstance]
  >;
  readonly json: S;
  readonly jsonAdd: S;
  readonly jsonUpdate: S;
}>;

const identity = (s: Schema.Schema.Any) => s;

export const WithArrayFields: <
  Field extends VariantSchema.Field<any> | Schema.Schema.Any
>(
  self: Field
) => Field extends Schema.Schema.Any
  ? WithArrayFields<Field>
  : Field extends VariantSchema.Field<infer S>
  ? VariantSchema.Field<{
      readonly [K in keyof S]: S[K] extends Schema.Schema.Any
        ? K extends 'update'
          ? Schema.Union<
              [S[K], typeof ArrayUnionInstance, typeof ArrayRemoveInstance]
            >
          : S[K]
        : never;
    }>
  : never = fieldEvolve({
  get: identity,
  add: identity,
  update: (s: Schema.Schema.Any) =>
    Schema.Union(s, ArrayUnionInstance, ArrayRemoveInstance),
  json: identity,
  jsonAdd: identity,
  jsonUpdate: identity,
}) as any;

/**
 * Convenience constructor that creates an array field with sentinel support.
 * Equivalent to `WithArraySentinels(Schema.Array(element))`.
 *
 * @example
 * ```ts
 * class PostModel extends Class<PostModel>('PostModel')({
 *   tags: Model.Array(Schema.String),
 * }) {}
 * ```
 */
export const Array = <A, I, R>(
  element: Schema.Schema<A, I, R>
): WithArrayFields<Schema.Array$<Schema.Schema<A, I, R>>> =>
  WithArrayFields(Schema.Array(element)) as any;
