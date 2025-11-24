import { Model, SqlSchema } from '@effect/sql';
import { Effect, Option, Schema } from 'effect';
import { VariantSchema } from '@effect/experimental';
import * as FirestoreSchema from '../schema/schema.js';
import { FirestoreService } from '../firestore-service.js';
import { Snapshot } from '../snapshot.js';
import { NoSuchElementException, UnknownException } from 'effect/Cause';
import { ParseError } from 'effect/ParseResult';
import { FirestoreError } from '../errors.js';

// TODO: Keep an eye on the progress of Effect v4 Models as they intend to be more agnostic to the database and more flexible.

export type DateTime = VariantSchema.Field<{
  select: typeof FirestoreSchema.TimestampDateTimeUtc;
  insert: typeof FirestoreSchema.TimestampDateTimeUtc;
  update: typeof FirestoreSchema.TimestampDateTimeUtc;
  json: typeof Schema.DateTimeUtc;
}>;

export const DateTime: DateTime = Model.Field({
  select: FirestoreSchema.TimestampDateTimeUtc,
  insert: FirestoreSchema.TimestampDateTimeUtc,
  update: FirestoreSchema.TimestampDateTimeUtc,
  json: Schema.DateTimeUtc,
});

export type DateTimeInsert = VariantSchema.Field<{
  select: typeof FirestoreSchema.TimestampDateTimeUtc;
  insert: typeof FirestoreSchema.ServerTimestamp;
  json: typeof Schema.DateTimeUtc;
}>;

export const DateTimeInsert: DateTimeInsert = Model.Field({
  select: FirestoreSchema.TimestampDateTimeUtc,
  insert: FirestoreSchema.ServerTimestamp,
  json: Schema.DateTimeUtc,
});

export type DateTimeUpdate = VariantSchema.Field<{
  select: typeof FirestoreSchema.TimestampDateTimeUtc;
  insert: typeof FirestoreSchema.ServerTimestamp;
  update: typeof FirestoreSchema.ServerTimestamp;
  json: typeof Schema.DateTimeUtc;
}>;

export const DateTimeUpdate: DateTimeUpdate = Model.Field({
  select: FirestoreSchema.TimestampDateTimeUtc,
  insert: FirestoreSchema.ServerTimestamp,
  update: FirestoreSchema.ServerTimestamp,
  json: Schema.DateTimeUtc,
});

export type ModelError =
  | FirestoreError
  | UnknownException
  | NoSuchElementException
  | ParseError;

export const makeRepository = <
  S extends Model.Any,
  Id extends keyof S['Type'] & keyof S['update']['Type'] & keyof S['fields'],
  IdSchema extends S['fields'][Id] extends Schema.Schema.Any
    ? S['fields'][Id]
    : never
>(
  Model: S,
  options: {
    readonly collectionPath: string;
    readonly idField: Id;
    readonly spanPrefix: string;
  }
) =>
  Effect.gen(function* () {
    const firestore = yield* FirestoreService;

    const idSchema = Model.fields[options.idField] as Schema.Schema.Any;

    const structFromSnapshot = (snapshot: Snapshot) => {
      const [ref, data] = snapshot;
      return { ...data, [options.idField]: ref.id };
    };

    const insertSchema = SqlSchema.single({
      Request: Model.insert,
      Result: idSchema,
      execute: (data: S['insert']['Type']) =>
        firestore
          .add(options.collectionPath, data)
          .pipe(Effect.flatMap((value) => Effect.succeed([value.id]))),
    });

    const insert = (
      data: S['insert']['Type']
    ): Effect.Effect<
      Schema.Schema.Type<IdSchema>,
      ModelError,
      S['Context'] | S['insert']['Context']
    > =>
      insertSchema(data).pipe(
        Effect.withSpan(`${options.spanPrefix}.insert`, {
          captureStackTrace: false,
          attributes: { data },
        })
      );

    const updateSchema = SqlSchema.void({
      Request: Model.update,
      execute: ({ [options.idField]: _id, ...data }: S['update']['Type']) =>
        firestore.update(`${options.collectionPath}/${_id}`, data),
    });

    const update = (data: S['update']['Type']) =>
      updateSchema(data).pipe(
        Effect.withSpan(`${options.spanPrefix}.update`, {
          captureStackTrace: false,
          attributes: { data },
        })
      );

    const findByIdSchema = SqlSchema.findOne({
      Request: idSchema,
      Result: Model,
      execute: (id: string) =>
        firestore
          .get(`${options.collectionPath}/${id}`)
          .pipe(
            Effect.flatMap(Option.map((value) => [structFromSnapshot(value)]))
          ),
    });

    const findById = (
      id: Schema.Schema.Type<IdSchema>
    ): Effect.Effect<
      Option.Option<S['Type']>,
      ModelError,
      S['Context'] | Schema.Schema.Context<S['fields'][Id]>
    > =>
      findByIdSchema(id).pipe(
        Effect.withSpan(`${options.spanPrefix}.findById`, {
          captureStackTrace: false,
          attributes: { id },
        })
      );

    const deleteSchema = SqlSchema.void({
      Request: idSchema,
      execute: (id: string) =>
        firestore.remove(`${options.collectionPath}/${id}`),
    });

    const deleteById = (
      id: Schema.Schema.Type<IdSchema>
    ): Effect.Effect<void, ModelError, S['Context']> =>
      deleteSchema(id).pipe(
        Effect.withSpan(`${options.spanPrefix}.deleteById`, {
          captureStackTrace: false,
          attributes: { id },
        })
      );

    return {
      insert,
      update,
      findById,
      delete: deleteById,
    };
  });
