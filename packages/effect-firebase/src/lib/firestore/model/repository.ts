import { Effect, Option, Schema, Stream } from 'effect';
import { FirestoreService } from '../firestore-service.js';
import { Snapshot } from '../snapshot.js';
import { NoSuchElementException, UnknownException } from 'effect/Cause';
import { ParseError } from 'effect/ParseResult';
import { FirestoreError } from '../errors.js';
import { Any } from './core.js';
import * as Fetch from './fetch.js';
import type { Query } from '../query/query.js';
import type { QueryConstraint } from '../query/constraints.js';

export type ModelError =
  | FirestoreError
  | UnknownException
  | NoSuchElementException
  | ParseError;

/**
 * Create a repository for a model.
 */
export const makeRepository = <
  S extends Any,
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

    const addSchema = Fetch.single({
      Request: Model.add,
      Result: idSchema,
      execute: (data: S['add']['Type']) =>
        firestore
          .add(options.collectionPath, data)
          .pipe(Effect.flatMap((value) => Effect.succeed([value.id]))),
    });

    const add = (
      data: S['add']['Type']
    ): Effect.Effect<
      Schema.Schema.Type<IdSchema>,
      ModelError,
      S['Context'] | S['add']['Context']
    > =>
      addSchema(data).pipe(
        Effect.withSpan(`${options.spanPrefix}.add`, {
          captureStackTrace: false,
          attributes: { data },
        })
      );

    const updateSchema = Fetch.void({
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

    const getByIdSchema = Fetch.findOne({
      Request: idSchema,
      Result: Model,
      execute: (id: string) =>
        firestore
          .get(`${options.collectionPath}/${id}`)
          .pipe(
            Effect.flatMap(Option.map((value) => [structFromSnapshot(value)]))
          ),
    });

    const getById = (
      id: Schema.Schema.Type<IdSchema>
    ): Effect.Effect<
      Option.Option<S['Type']>,
      ModelError,
      S['Context'] | Schema.Schema.Context<S['fields'][Id]>
    > =>
      getByIdSchema(id).pipe(
        Effect.withSpan(`${options.spanPrefix}.findById`, {
          captureStackTrace: false,
          attributes: { id },
        })
      );

    const deleteSchema = Fetch.void({
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

    const querySchema = Fetch.findAll({
      Request: Schema.Array(Schema.Any),
      Result: Model,
      execute: (constraints: ReadonlyArray<unknown>) =>
        firestore
          .query(
            options.collectionPath,
            constraints as ReadonlyArray<QueryConstraint>
          )
          .pipe(Effect.map((snapshots) => snapshots.map(structFromSnapshot))),
    });

    const query = (
      constraints: Query<S>
    ): Effect.Effect<ReadonlyArray<S['Type']>, ModelError, S['Context']> =>
      querySchema(constraints as ReadonlyArray<unknown>).pipe(
        Effect.withSpan(`${options.spanPrefix}.query`, {
          captureStackTrace: false,
        })
      );

    const getByIdStreamSchema = Fetch.streamOne({
      Request: idSchema,
      Result: Model,
      execute: (id: string) =>
        firestore
          .streamDoc(`${options.collectionPath}/${id}`)
          .pipe(Stream.map(Option.map((value) => structFromSnapshot(value)))),
    });

    const getByIdStream = (
      id: Schema.Schema.Type<IdSchema>
    ): Stream.Stream<
      Option.Option<S['Type']>,
      ModelError,
      S['Context'] | Schema.Schema.Context<S['fields'][Id]>
    > =>
      getByIdStreamSchema(id).pipe(
        Stream.tap(() =>
          Effect.logTrace(`${options.spanPrefix}.streamById`, { id })
        )
      );

    const queryStreamSchema = Fetch.streamAll({
      Request: Schema.Array(Schema.Any),
      Result: Model,
      execute: (constraints: ReadonlyArray<unknown>) =>
        firestore
          .streamQuery(
            options.collectionPath,
            constraints as ReadonlyArray<QueryConstraint>
          )
          .pipe(Stream.map((snapshots) => snapshots.map(structFromSnapshot))),
    });

    const queryStream = (
      constraints: Query<S>
    ): Stream.Stream<ReadonlyArray<S['Type']>, ModelError, S['Context']> =>
      queryStreamSchema(constraints as ReadonlyArray<unknown>).pipe(
        Stream.tap(() => Effect.logTrace(`${options.spanPrefix}.streamQuery`))
      );

    return {
      /**
       * Add a document model.
       * @param data - The data to add the document model with.
       * @returns The ID of the added document model.
       */
      add,

      /**
       * Update a document model.
       * @param data - The data to update the document model with.
       * @returns A unit value.
       */
      update,

      /**
       * Get a document model by ID.
       * @param id - The ID of the document model to get.
       * @returns The document model.
       */
      getById,

      /**
       * Stream a document model by ID.
       * @param id - The ID of the document model to stream.
       * @returns A {@link https://effect.website/docs/stream/introduction/ | Stream} of the model and any updates to it.
       */
      getByIdStream,

      /**
       * Delete a document model by ID.
       * @param id - The ID of the document model to delete.
       * @returns A unit value.
       */
      delete: deleteById,

      /**
       * Query the database.
       * @param constraints - The constraints to apply to the query.
       * @returns A list of the results of the query.
       */
      query,

      /**
       * Stream the results of a query.
       * @param constraints - The constraints to apply to the query.
       * @returns A {@link https://effect.website/docs/stream/introduction/ | Stream} of the results of the query.
       */
      queryStream,
    };
  });
