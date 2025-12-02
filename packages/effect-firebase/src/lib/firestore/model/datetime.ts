import { Effect, Option, Schema } from 'effect';
import { VariantSchema } from '@effect/experimental';
import { Field } from './core.js';
import * as FirestoreSchema from '../schema/schema.js';

export type DateTime = VariantSchema.Field<{
  select: typeof FirestoreSchema.TimestampDateTimeUtc;
  insert: typeof FirestoreSchema.TimestampDateTimeUtc;
  update: typeof FirestoreSchema.TimestampDateTimeUtc;
  json: typeof Schema.DateTimeUtc;
}>;

export const DateTime: DateTime = Field({
  select: FirestoreSchema.TimestampDateTimeUtc,
  insert: FirestoreSchema.TimestampDateTimeUtc,
  update: FirestoreSchema.TimestampDateTimeUtc,
  json: Schema.DateTimeUtc,
});

export type ServerDateTime = VariantSchema.Field<{
  select: typeof FirestoreSchema.TimestampDateTimeUtc;
  insert: typeof FirestoreSchema.ServerTimestamp;
  update: typeof FirestoreSchema.ServerTimestamp;
  json: typeof Schema.DateTimeUtc;
}>;

export const ServerDateTime = VariantSchema.Overrideable(
  Schema.Union(FirestoreSchema.Timestamp, FirestoreSchema.ServerTimestamp),
  Schema.DateTimeUtcFromSelf,
  {
    generate: Option.match({
      onNone: () => Effect.succeed(new FirestoreSchema.ServerTimestamp()),
      onSome: (dt) =>
        Effect.succeed(FirestoreSchema.Timestamp.fromDateTime(dt)),
    }),
    decode: FirestoreSchema.AnyTimestampDateTimeUtc,
  }
);

export type DateTimeInsert = VariantSchema.Field<{
  select: typeof FirestoreSchema.TimestampDateTimeUtc;
  insert: typeof ServerDateTime;
  json: typeof Schema.DateTimeUtc;
}>;

/**
 * A field that represents a date time value that is inserted into the database.
 */
export const DateTimeInsert: DateTimeInsert = Field({
  select: FirestoreSchema.TimestampDateTimeUtc,
  insert: ServerDateTime,
  json: Schema.DateTimeUtc,
});

export type DateTimeUpdate = VariantSchema.Field<{
  select: typeof FirestoreSchema.TimestampDateTimeUtc;
  insert: typeof ServerDateTime;
  update: typeof ServerDateTime;
  json: typeof Schema.DateTimeUtc;
}>;

/**
 * A field that represents a date time value that is updated in the database.
 */
export const DateTimeUpdate: DateTimeUpdate = Field({
  select: FirestoreSchema.TimestampDateTimeUtc,
  insert: ServerDateTime,
  update: ServerDateTime,
  json: Schema.DateTimeUtc,
});
