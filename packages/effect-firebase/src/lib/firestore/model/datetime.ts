import { Effect, Option, Schema } from 'effect';
import { VariantSchema } from '@effect/experimental';
import { Field } from './core.js';
import * as FirestoreSchema from '../schema/schema.js';

export type DateTime = VariantSchema.Field<{
  get: typeof FirestoreSchema.TimestampDateTimeUtc;
  add: typeof FirestoreSchema.TimestampDateTimeUtc;
  update: typeof FirestoreSchema.TimestampDateTimeUtc;
  json: typeof Schema.DateTimeUtc;
}>;

export const DateTime: DateTime = Field({
  get: FirestoreSchema.TimestampDateTimeUtc,
  add: FirestoreSchema.TimestampDateTimeUtc,
  update: FirestoreSchema.TimestampDateTimeUtc,
  json: Schema.DateTimeUtc,
});

export type ServerDateTime = VariantSchema.Field<{
  get: typeof FirestoreSchema.TimestampDateTimeUtc;
  add: typeof FirestoreSchema.ServerTimestamp;
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
  get: typeof FirestoreSchema.TimestampDateTimeUtc;
  add: typeof ServerDateTime;
  json: typeof Schema.DateTimeUtc;
}>;

/**
 * A field that represents the date and time when the model was created.
 */
export const DateTimeInsert: DateTimeInsert = Field({
  get: FirestoreSchema.TimestampDateTimeUtc,
  add: ServerDateTime,
  json: Schema.DateTimeUtc,
});

export type DateTimeUpdate = VariantSchema.Field<{
  get: typeof FirestoreSchema.TimestampDateTimeUtc;
  add: typeof ServerDateTime;
  update: typeof ServerDateTime;
  json: typeof Schema.DateTimeUtc;
}>;

/**
 * A field that represents the date and time when the model was last updated.
 */
export const DateTimeUpdate: DateTimeUpdate = Field({
  get: FirestoreSchema.TimestampDateTimeUtc,
  add: ServerDateTime,
  update: ServerDateTime,
  json: Schema.DateTimeUtc,
});
