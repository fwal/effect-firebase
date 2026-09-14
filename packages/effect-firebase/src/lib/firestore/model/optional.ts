import { Schema } from 'effect';
import { Model, VariantSchema } from 'effect/unstable/schema';
import { DeleteInstance } from '../fields/delete.js';

/**
 * Convert a field to one that is optional for all variants.
 *
 * For the database variants, it will only accept `null` values.
 * For the JSON variants, it will also accept missing keys.
 */
export type OptionalNull<S extends Schema.Top> = VariantSchema.Field<{
  readonly select: Schema.OptionFromNullOr<S>;
  readonly insert: Schema.OptionFromNullOr<S>;
  readonly update: Schema.OptionFromNullOr<S>;
  readonly json: Schema.OptionFromOptional<S>;
  readonly jsonCreate: Schema.OptionFromOptionalNullOr<S>;
  readonly jsonUpdate: Schema.OptionFromOptionalNullOr<S>;
}>;

/**
 * Convert a field to one that is optional for all variants.
 *
 * For the database variants, it will only accept `null` values.
 * For the JSON variants, it will also accept missing keys.
 */
export const OptionalNull: <
  Field extends VariantSchema.Field<any> | Schema.Top,
>(
  self: Field,
) => Field extends Schema.Top
  ? OptionalNull<Field>
  : Field extends VariantSchema.Field<infer S>
    ? VariantSchema.Field<{
        readonly [K in keyof S]: S[K] extends Schema.Top
          ? K extends Model.VariantsDatabase
            ? Schema.OptionFromNullOr<S[K]>
            : Schema.OptionFromOptionalNullOr<S[K]>
          : never;
      }>
    : never = Model.fieldEvolve({
  select: Schema.OptionFromNullOr,
  insert: Schema.OptionFromNullOr,
  update: Schema.OptionFromNullOr,
  json: Schema.OptionFromOptional,
  jsonCreate: Schema.OptionFromOptionalNullOr,
  jsonUpdate: Schema.OptionFromOptionalNullOr,
}) as any;

/**
 * Convert a field to one that is optional for all variants.
 *
 * For the database variants, a missing key, `null` and `undefined` all decode
 * to `Option.none()`, and the key is optional in the `Encoded` type.
 * `Option.none()` is encoded as `null`, so write payloads always carry the key.
 * For the JSON variants, `Option.none()` is encoded as a missing key.
 */
export type Optional<S extends Schema.Top> = VariantSchema.Field<{
  readonly select: Schema.OptionFromOptionalNullOr<S>;
  readonly insert: Schema.OptionFromOptionalNullOr<S>;
  readonly update: Schema.OptionFromOptionalNullOr<S>;
  readonly json: Schema.OptionFromOptional<S>;
  readonly jsonCreate: Schema.OptionFromOptionalNullOr<S>;
  readonly jsonUpdate: Schema.OptionFromOptionalNullOr<S>;
}>;

/**
 * Convert a field to one that is optional for all variants.
 *
 * For the database variants, a missing key, `null` and `undefined` all decode
 * to `Option.none()`, and the key is optional in the `Encoded` type.
 * `Option.none()` is encoded as `null`, so write payloads always carry the key.
 * For the JSON variants, `Option.none()` is encoded as a missing key.
 */
export const Optional: <Field extends VariantSchema.Field<any> | Schema.Top>(
  self: Field,
) => Field extends Schema.Top
  ? Optional<Field>
  : Field extends VariantSchema.Field<infer S>
    ? VariantSchema.Field<{
        readonly [K in keyof S]: S[K] extends Schema.Top
          ? Schema.OptionFromOptionalNullOr<S[K]>
          : never;
      }>
    : never = Model.fieldEvolve({
  select: (s: Schema.Top) =>
    Schema.OptionFromOptionalNullOr(s, { onNoneEncoding: null }),
  insert: (s: Schema.Top) =>
    Schema.OptionFromOptionalNullOr(s, { onNoneEncoding: null }),
  update: (s: Schema.Top) =>
    Schema.OptionFromOptionalNullOr(s, { onNoneEncoding: null }),
  json: Schema.OptionFromOptional,
  jsonCreate: Schema.OptionFromOptionalNullOr,
  jsonUpdate: Schema.OptionFromOptionalNullOr,
}) as any;

/**
 * Convert a field to one that is optional for all variants and can be deleted.
 *
 * For the database variants, a missing key or `undefined` decodes to
 * `Option.none()`, which is encoded as a missing key. The `update` variant
 * additionally accepts a `Delete` sentinel.
 * The `jsonCreate` and `jsonUpdate` variants additionally accept `null`.
 */
export type OptionalDeletable<S extends Schema.Top> = VariantSchema.Field<{
  readonly select: Schema.OptionFromOptional<S>;
  readonly insert: Schema.OptionFromOptional<S>;
  readonly update: Schema.OptionFromOptional<
    Schema.Union<readonly [S, typeof DeleteInstance]>
  >;
  readonly json: Schema.OptionFromOptional<S>;
  readonly jsonCreate: Schema.OptionFromOptionalNullOr<S>;
  readonly jsonUpdate: Schema.OptionFromOptionalNullOr<S>;
}>;

export const OptionalDeletable: <
  Field extends VariantSchema.Field<any> | Schema.Top,
>(
  self: Field,
) => Field extends Schema.Top
  ? OptionalDeletable<Field>
  : Field extends VariantSchema.Field<infer S>
    ? VariantSchema.Field<{
        readonly [K in keyof S]: S[K] extends Schema.Top
          ? K extends 'update'
            ? Schema.OptionFromOptional<
                Schema.Union<readonly [S[K], typeof DeleteInstance]>
              >
            : K extends 'jsonCreate' | 'jsonUpdate'
              ? Schema.OptionFromOptionalNullOr<S[K]>
              : Schema.OptionFromOptional<S[K]>
          : never;
      }>
    : never = Model.fieldEvolve({
  select: Schema.OptionFromOptional,
  insert: Schema.OptionFromOptional,
  update: (s: Schema.Top) =>
    Schema.OptionFromOptional(Schema.Union([s, DeleteInstance])),
  json: Schema.OptionFromOptional,
  jsonCreate: Schema.OptionFromOptionalNullOr,
  jsonUpdate: Schema.OptionFromOptionalNullOr,
}) as any;
