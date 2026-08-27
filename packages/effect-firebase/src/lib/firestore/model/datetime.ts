import {
  DateTime as EffectDateTime,
  Effect,
  Schema,
  SchemaGetter,
  SchemaIssue,
} from 'effect';
import { Model, VariantSchema } from 'effect/unstable/schema';
import * as FirestoreSchema from '../schema/schema.js';

export type DateTime = VariantSchema.Field<{
  select: typeof FirestoreSchema.TimestampDateTimeUtc;
  insert: typeof FirestoreSchema.TimestampDateTimeUtc;
  update: typeof FirestoreSchema.TimestampDateTimeUtc;
  json: typeof Schema.DateTimeUtcFromString;
}>;

export const DateTime: DateTime = Model.Field({
  select: FirestoreSchema.TimestampDateTimeUtc,
  insert: FirestoreSchema.TimestampDateTimeUtc,
  update: FirestoreSchema.TimestampDateTimeUtc,
  json: Schema.DateTimeUtcFromString,
});

/**
 * Schema for add/update variants that:
 * - Decodes: Timestamp → DateTime.Utc (ServerTimestamp decode fails)
 * - Encodes: DateTime.Utc → Timestamp, undefined → ServerTimestamp
 */
const ServerDateTimeSchema = Schema.Union([
  FirestoreSchema.TimestampInstance,
  FirestoreSchema.ServerTimestampInstance,
]).pipe(
  Schema.decodeTo(Schema.UndefinedOr(Schema.DateTimeUtc), {
    decode: SchemaGetter.transformOrFail(
      (input: FirestoreSchema.Timestamp | FirestoreSchema.ServerTimestamp) => {
        if (input instanceof FirestoreSchema.Timestamp) {
          return Effect.succeed(
            EffectDateTime.makeUnsafe(input.toMillis()) as
              EffectDateTime.Utc | undefined,
          );
        }
        return Effect.fail(
          new SchemaIssue.Forbidden({
            message: 'ServerTimestamp cannot be decoded to DateTime',
          }),
        );
      },
    ),
    encode: SchemaGetter.transform(
      (
        dt: EffectDateTime.Utc | undefined,
      ): FirestoreSchema.Timestamp | FirestoreSchema.ServerTimestamp =>
        dt !== undefined
          ? FirestoreSchema.Timestamp.fromDateTime(dt)
          : new FirestoreSchema.ServerTimestamp(),
    ),
  }),
);

export type ServerDateTime = VariantSchema.Field<{
  select: typeof FirestoreSchema.AnyTimestampDateTimeUtc;
  insert: typeof ServerDateTimeSchema;
  update: typeof ServerDateTimeSchema;
  json: typeof Schema.DateTimeUtcFromString;
}>;

export const ServerDateTime: ServerDateTime = Model.Field({
  select: FirestoreSchema.AnyTimestampDateTimeUtc,
  insert: ServerDateTimeSchema,
  update: ServerDateTimeSchema,
  json: Schema.DateTimeUtcFromString,
});

export type DateTimeInsert = VariantSchema.Field<{
  select: typeof FirestoreSchema.TimestampDateTimeUtc;
  insert: typeof ServerDateTimeSchema;
  json: typeof Schema.DateTimeUtcFromString;
}>;

/**
 * A field that represents the date and time when the model was created.
 */
export const DateTimeInsert: DateTimeInsert = Model.Field({
  select: FirestoreSchema.TimestampDateTimeUtc,
  insert: ServerDateTimeSchema,
  json: Schema.DateTimeUtcFromString,
});

/**
 * Adds `ServerTimestamp` sentinel support to a timestamp field's `insert` and
 * `update` variants.
 *
 * The `get` and JSON variants keep the original type unchanged. The `insert`
 * and `update` variants additionally accept a `ServerTimestamp` value
 * (created via `serverTimestamp()`) which is converted to
 * `FieldValue.serverTimestamp()` by the client/admin converters.
 *
 * Unlike `DateTimeInsert`/`DateTimeUpdate`, the field is not auto-managed:
 * the server timestamp is written only when explicitly requested.
 *
 * @example
 * ```ts
 * class UserModel extends Class<UserModel>('UserModel')({
 *   id: Schema.String,
 *   lastSeenAt: Model.WithServerTimestamp(Model.DateTime),
 * }) {}
 *
 * // insert/update variants accept:
 * userRepo.update('id', { lastSeenAt: DateTime.makeUnsafe(0) }); // explicit
 * userRepo.update('id', { lastSeenAt: serverTimestamp() });      // server time
 * ```
 */
export type WithServerTimestamp<S extends Schema.Top> = VariantSchema.Field<{
  readonly select: S;
  readonly insert: Schema.Union<
    readonly [S, typeof FirestoreSchema.ServerTimestampInstance]
  >;
  readonly update: Schema.Union<
    readonly [S, typeof FirestoreSchema.ServerTimestampInstance]
  >;
  readonly json: S;
  readonly jsonCreate: S;
  readonly jsonUpdate: S;
}>;

const identity = (s: Schema.Top) => s;

export const WithServerTimestamp: <
  Field extends VariantSchema.Field<any> | Schema.Top,
>(
  self: Field,
) => Field extends Schema.Top
  ? WithServerTimestamp<Field>
  : Field extends VariantSchema.Field<infer S>
    ? VariantSchema.Field<{
        readonly [K in keyof S]: S[K] extends Schema.Top
          ? K extends 'insert' | 'update'
            ? Schema.Union<
                readonly [
                  S[K],
                  typeof FirestoreSchema.ServerTimestampInstance,
                ]
              >
            : S[K]
          : never;
      }>
    : never = Model.fieldEvolve({
  select: identity,
  insert: (s: Schema.Top) =>
    Schema.Union([s, FirestoreSchema.ServerTimestampInstance]),
  update: (s: Schema.Top) =>
    Schema.Union([s, FirestoreSchema.ServerTimestampInstance]),
  json: identity,
  jsonCreate: identity,
  jsonUpdate: identity,
}) as any;

export type DateTimeUpdate = VariantSchema.Field<{
  select: typeof FirestoreSchema.TimestampDateTimeUtc;
  insert: typeof ServerDateTimeSchema;
  update: typeof ServerDateTimeSchema;
  json: typeof Schema.DateTimeUtcFromString;
}>;

/**
 * A field that represents the date and time when the model was last updated.
 */
export const DateTimeUpdate: DateTimeUpdate = Model.Field({
  select: FirestoreSchema.TimestampDateTimeUtc,
  insert: ServerDateTimeSchema,
  update: ServerDateTimeSchema,
  json: Schema.DateTimeUtcFromString,
});
