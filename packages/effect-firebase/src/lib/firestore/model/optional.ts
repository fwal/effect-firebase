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
  Field extends VariantSchema.Field<any> | Schema.Top
>(
  self: Field
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
 * For the database variants, it will accept `null` or `undefined` values.
 * For the JSON variants, it will also accept missing keys.
 */
export type Optional<S extends Schema.Top> = VariantSchema.Field<{
  readonly select: Schema.OptionFromNullishOr<S>;
  readonly insert: Schema.OptionFromNullishOr<S>;
  readonly update: Schema.OptionFromNullishOr<S>;
  readonly json: Schema.OptionFromOptional<S>;
  readonly jsonCreate: Schema.OptionFromOptionalNullOr<S>;
  readonly jsonUpdate: Schema.OptionFromOptionalNullOr<S>;
}>;

/**
 * Convert a field to one that is optional for all variants.
 *
 * For the database variants, it will accept `null` or `undefined` values.
 * For the JSON variants, it will also accept missing keys.
 */
export const Optional: <Field extends VariantSchema.Field<any> | Schema.Top>(
  self: Field
) => Field extends Schema.Top
  ? Optional<Field>
  : Field extends VariantSchema.Field<infer S>
  ? VariantSchema.Field<{
      readonly [K in keyof S]: S[K] extends Schema.Top
        ? K extends Model.VariantsDatabase
          ? Schema.OptionFromNullishOr<S[K]>
          : Schema.OptionFromOptionalNullOr<S[K]>
        : never;
    }>
  : never = Model.fieldEvolve({
  select: (s: Schema.Top) =>
    Schema.OptionFromNullishOr(s, { onNoneEncoding: null }),
  insert: (s: Schema.Top) =>
    Schema.OptionFromNullishOr(s, { onNoneEncoding: null }),
  update: (s: Schema.Top) =>
    Schema.OptionFromNullishOr(s, { onNoneEncoding: null }),
  json: Schema.OptionFromOptional,
  jsonCreate: Schema.OptionFromOptionalNullOr,
  jsonUpdate: Schema.OptionFromOptionalNullOr,
}) as any;

/**
 * Convert a field to one that is optional for all variants and can be deleted.
 *
 * For the database variants, it will accept `undefined` or `Delete` values.
 * For the JSON variants, it will also accept missing keys.
 */
export type OptionalDeletable<S extends Schema.Top> = VariantSchema.Field<{
  readonly select: Schema.OptionFromOptional<S>;
  readonly insert: Schema.OptionFromOptional<S>;
  readonly update: Schema.OptionFromUndefinedOr<
    Schema.Union<readonly [S, typeof DeleteInstance]>
  >;
  readonly json: Schema.OptionFromOptional<S>;
  readonly jsonCreate: Schema.OptionFromOptionalNullOr<S>;
  readonly jsonUpdate: Schema.OptionFromOptionalNullOr<S>;
}>;

export const OptionalDeletable: <
  Field extends VariantSchema.Field<any> | Schema.Top
>(
  self: Field
) => Field extends Schema.Top
  ? OptionalDeletable<Field>
  : Field extends VariantSchema.Field<infer S>
  ? VariantSchema.Field<{
      readonly [K in keyof S]: S[K] extends Schema.Top
        ? K extends Model.VariantsDatabase
          ? Schema.OptionFromUndefinedOr<S[K]>
          : Schema.OptionFromUndefinedOr<
              Schema.Union<readonly [S[K], typeof DeleteInstance]>
            >
        : never;
    }>
  : never = Model.fieldEvolve({
  select: Schema.OptionFromOptional,
  insert: Schema.OptionFromOptional,
  update: (s: Schema.Top) =>
    Schema.OptionFromUndefinedOr(Schema.Union([s, DeleteInstance])),
  json: Schema.OptionFromOptional,
  jsonCreate: Schema.OptionFromOptionalNullOr,
  jsonUpdate: Schema.OptionFromOptionalNullOr,
}) as any;
