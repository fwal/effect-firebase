import {
  DateTime as EffectDateTime,
  Effect,
  Option,
  Schema,
  SchemaGetter,
  SchemaIssue,
} from 'effect';
import { VariantSchema } from 'effect/unstable/schema';
import { Field } from './core.js';
import * as FirestoreSchema from '../schema/schema.js';

export type DateTime = VariantSchema.Field<{
  get: typeof FirestoreSchema.TimestampDateTimeUtc;
  add: typeof FirestoreSchema.TimestampDateTimeUtc;
  update: typeof FirestoreSchema.TimestampDateTimeUtc;
  json: typeof Schema.DateTimeUtcFromString;
}>;

export const DateTime: DateTime = Field({
  get: FirestoreSchema.TimestampDateTimeUtc,
  add: FirestoreSchema.TimestampDateTimeUtc,
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
              | EffectDateTime.Utc
              | undefined
          );
        }
        return Effect.fail(
          new SchemaIssue.Forbidden(Option.some(input), {
            message: 'ServerTimestamp cannot be decoded to DateTime',
          })
        );
      }
    ),
    encode: SchemaGetter.transform(
      (
        dt: EffectDateTime.Utc | undefined
      ): FirestoreSchema.Timestamp | FirestoreSchema.ServerTimestamp =>
        dt !== undefined
          ? FirestoreSchema.Timestamp.fromDateTime(dt)
          : new FirestoreSchema.ServerTimestamp()
    ),
  })
);

export type ServerDateTime = VariantSchema.Field<{
  get: typeof FirestoreSchema.AnyTimestampDateTimeUtc;
  add: typeof ServerDateTimeSchema;
  update: typeof ServerDateTimeSchema;
  json: typeof Schema.DateTimeUtcFromString;
}>;

export const ServerDateTime: ServerDateTime = Field({
  get: FirestoreSchema.AnyTimestampDateTimeUtc,
  add: ServerDateTimeSchema,
  update: ServerDateTimeSchema,
  json: Schema.DateTimeUtcFromString,
});

export type DateTimeInsert = VariantSchema.Field<{
  get: typeof FirestoreSchema.TimestampDateTimeUtc;
  add: typeof ServerDateTimeSchema;
  json: typeof Schema.DateTimeUtcFromString;
}>;

/**
 * A field that represents the date and time when the model was created.
 */
export const DateTimeInsert: DateTimeInsert = Field({
  get: FirestoreSchema.TimestampDateTimeUtc,
  add: ServerDateTimeSchema,
  json: Schema.DateTimeUtcFromString,
});

export type DateTimeUpdate = VariantSchema.Field<{
  get: typeof FirestoreSchema.TimestampDateTimeUtc;
  add: typeof ServerDateTimeSchema;
  update: typeof ServerDateTimeSchema;
  json: typeof Schema.DateTimeUtcFromString;
}>;

/**
 * A field that represents the date and time when the model was last updated.
 */
export const DateTimeUpdate: DateTimeUpdate = Field({
  get: FirestoreSchema.TimestampDateTimeUtc,
  add: ServerDateTimeSchema,
  update: ServerDateTimeSchema,
  json: Schema.DateTimeUtcFromString,
});
