import { Schema } from 'effect';
import { VariantSchema } from '@effect/experimental';
import { VariantsDatabase, fieldEvolve } from './core.js';
import { Delete } from '../schema/delete.js';

/**
 * Convert a field to one that is optional for all variants.
 *
 * For the database variants, it will only accept `null` values.
 * For the JSON variants, it will also accept missing keys.
 */
export type OptionalNull<S extends Schema.Schema.Any> = VariantSchema.Field<{
  readonly get: Schema.OptionFromNullOr<S>;
  readonly add: Schema.OptionFromNullOr<S>;
  readonly update: Schema.OptionFromNullOr<S>;
  readonly json: Schema.optionalWith<S, { as: 'Option' }>;
  readonly jsonAdd: Schema.optionalWith<S, { as: 'Option'; nullable: true }>;
  readonly jsonUpdate: Schema.optionalWith<S, { as: 'Option'; nullable: true }>;
}>;

/**
 * Convert a field to one that is optional for all variants.
 *
 * For the database variants, it will only accept `null` values.
 * For the JSON variants, it will also accept missing keys.
 */
export const OptionalNull: <
  Field extends VariantSchema.Field<any> | Schema.Schema.Any
>(
  self: Field
) => Field extends Schema.Schema.Any
  ? OptionalNull<Field>
  : Field extends VariantSchema.Field<infer S>
  ? VariantSchema.Field<{
      readonly [K in keyof S]: S[K] extends Schema.Schema.Any
        ? K extends VariantsDatabase
          ? Schema.OptionFromNullOr<S[K]>
          : Schema.optionalWith<S[K], { as: 'Option'; nullable: true }>
        : never;
    }>
  : never = fieldEvolve({
  get: Schema.OptionFromNullOr,
  add: Schema.OptionFromNullOr,
  update: Schema.OptionFromNullOr,
  json: Schema.optionalWith({ as: 'Option' }),
  jsonAdd: Schema.optionalWith({ as: 'Option', nullable: true }),
  jsonUpdate: Schema.optionalWith({ as: 'Option', nullable: true }),
}) as any;

/**
 * Convert a field to one that is optional for all variants.
 *
 * For the database variants, it will accept `null` or `undefined` values.
 * For the JSON variants, it will also accept missing keys.
 */
export type Optional<S extends Schema.Schema.Any> = VariantSchema.Field<{
  readonly get: Schema.OptionFromNullishOr<S>;
  readonly add: Schema.OptionFromNullishOr<S>;
  readonly update: Schema.OptionFromNullishOr<S>;
  readonly json: Schema.optionalWith<S, { as: 'Option' }>;
  readonly jsonAdd: Schema.optionalWith<S, { as: 'Option'; nullable: true }>;
  readonly jsonUpdate: Schema.optionalWith<S, { as: 'Option'; nullable: true }>;
}>;

/**
 * Convert a field to one that is optional for all variants.
 *
 * For the database variants, it will accept `null` or `undefined` values.
 * For the JSON variants, it will also accept missing keys.
 */
export const Optional: <
  Field extends VariantSchema.Field<any> | Schema.Schema.Any
>(
  self: Field
) => Field extends Schema.Schema.Any
  ? Optional<Field>
  : Field extends VariantSchema.Field<infer S>
  ? VariantSchema.Field<{
      readonly [K in keyof S]: S[K] extends Schema.Schema.Any
        ? K extends VariantsDatabase
          ? Schema.OptionFromNullishOr<S[K]>
          : Schema.optionalWith<S[K], { as: 'Option'; nullable: true }>
        : never;
    }>
  : never = fieldEvolve({
  get: (s: Schema.Schema.Any) => Schema.OptionFromNullishOr(s, null),
  add: (s: Schema.Schema.Any) => Schema.OptionFromNullishOr(s, null),
  update: (s: Schema.Schema.Any) => Schema.OptionFromNullishOr(s, null),
  json: Schema.optionalWith({ as: 'Option' }),
  jsonAdd: Schema.optionalWith({ as: 'Option', nullable: true }),
  jsonUpdate: Schema.optionalWith({ as: 'Option', nullable: true }),
}) as any;

/**
 * Convert a field to one that is optional for all variants and can be deleted.
 *
 * For the database variants, it will accept `undefined` or `Delete` values.
 * For the JSON variants, it will also accept missing keys.
 */
export type OptionalDeletable<S extends Schema.Schema.Any> =
  VariantSchema.Field<{
    readonly get: Schema.OptionFromUndefinedOr<S>;
    readonly add: Schema.OptionFromUndefinedOr<S>;
    readonly update: Schema.OptionFromUndefinedOr<
      Schema.Union<[S, typeof Delete]>
    >;
    readonly json: Schema.optionalWith<S, { as: 'Option' }>;
    readonly jsonAdd: Schema.optionalWith<S, { as: 'Option'; nullable: true }>;
    readonly jsonUpdate: Schema.optionalWith<
      S,
      { as: 'Option'; nullable: true }
    >;
  }>;

export const OptionalDeletable: <
  Field extends VariantSchema.Field<any> | Schema.Schema.Any
>(
  self: Field
) => Field extends Schema.Schema.Any
  ? OptionalDeletable<Field>
  : Field extends VariantSchema.Field<infer S>
  ? VariantSchema.Field<{
      readonly [K in keyof S]: S[K] extends Schema.Schema.Any
        ? K extends VariantsDatabase
          ? Schema.OptionFromUndefinedOr<S[K]>
          : Schema.OptionFromUndefinedOr<Schema.Union<[S[K], typeof Delete]>>
        : never;
    }>
  : never = fieldEvolve({
  get: Schema.OptionFromUndefinedOr,
  add: Schema.OptionFromUndefinedOr,
  update: (s: Schema.Schema.Any) =>
    Schema.OptionFromUndefinedOr(Schema.Union(s, Delete)),
  json: Schema.optionalWith({ as: 'Option' }),
  jsonAdd: Schema.optionalWith({ as: 'Option', nullable: true }),
  jsonUpdate: Schema.optionalWith({ as: 'Option', nullable: true }),
}) as any;
