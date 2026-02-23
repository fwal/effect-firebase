import { Effect, Option, Schema, Stream } from 'effect';
import { FirestoreService } from '../firestore-service.js';
import { Snapshot } from '../snapshot.js';
import { NoSuchElementException, UnknownException } from 'effect/Cause';
import { ParseError } from 'effect/ParseResult';
import { FirestoreError } from '../errors.js';
import { Any } from './core.js';
import * as Fetch from './fetch.js';
import type { QueryConstraint } from '../query/constraints.js';

export type ModelError =
  | FirestoreError
  | UnknownException
  | NoSuchElementException
  | ParseError;

export type RepositoryQuery<S> = ReadonlyArray<QueryConstraint> & {
  readonly _schema?: S;
};

export type Repository<
  S extends Any,
  Id extends keyof S['Type'] & keyof S['update']['Type'] & keyof S['fields'],
  IdSchema extends S['fields'][Id] extends Schema.Schema.Any
    ? S['fields'][Id]
    : never
> = {
  /**
   * Add a document model.
   * @param data - The data to add the document model with.
   * @returns The ID of the added document model.
   */
  readonly add: (
    data: S['add']['Type']
  ) => Effect.Effect<
    Schema.Schema.Type<IdSchema>,
    ModelError,
    S['Context'] | S['add']['Context']
  >;

  /**
   * Update a document model.
   * @param id - The ID of the document model to update.
   * @param data - The partial data to update the document model with. All fields are optional.
   * @returns A unit value.
   */
  readonly update: (
    id: Schema.Schema.Type<IdSchema>,
    data: Partial<Omit<S['update']['Type'], Id>>
  ) => Effect.Effect<void, ModelError, S['Context'] | S['update']['Context']>;

  /**
   * Get a document model by ID.
   * @param id - The ID of the document model to get.
   * @returns The document model.
   */
  readonly getById: (
    id: Schema.Schema.Type<IdSchema>
  ) => Effect.Effect<
    Option.Option<S['Type']>,
    ModelError,
    S['Context'] | Schema.Schema.Context<S['fields'][Id]>
  >;

  /**
   * Stream a document model by ID.
   * @param id - The ID of the document model to stream.
   * @returns A {@link https://effect.website/docs/stream/introduction/ | Stream} of the model and any updates to it.
   */
  readonly getByIdStream: (
    id: Schema.Schema.Type<IdSchema>
  ) => Stream.Stream<
    Option.Option<S['Type']>,
    ModelError,
    S['Context'] | Schema.Schema.Context<S['fields'][Id]>
  >;
  /**
   * Delete a document model by ID.
   * @param id - The ID of the document model to delete.
   * @returns A unit value.
   */
  readonly delete: (
    id: Schema.Schema.Type<IdSchema>
  ) => Effect.Effect<void, ModelError, S['Context']>;

  /**
   * Query the database.
   * @param constraints - The constraints to apply to the query.
   * @returns A list of the results of the query.
   */
  readonly query: (
    constraints: RepositoryQuery<S>
  ) => Effect.Effect<ReadonlyArray<S['Type']>, ModelError, S['Context']>;

  /**
   * Stream the results of a query.
   * @param constraints - The constraints to apply to the query.
   * @returns A {@link https://effect.website/docs/stream/introduction/ | Stream} of the results of the query.
   */
  readonly queryStream: (
    constraints: RepositoryQuery<S>
  ) => Stream.Stream<ReadonlyArray<S['Type']>, ModelError, S['Context']>;
};

/**
 * Create a repository for a document model.
 * @param Model - The model to create a repository for.
 * @param options - The options for the repository.
 * @returns The repository.
 *
 * @example
 * ```ts
 * import { Model } from 'effect-firebase';
 * import { PostModel } from './post.js';
 *
 * const PostRepository = Model.makeRepository(PostModel, {
 *   collectionPath: 'posts',
 *   idField: 'id',
 *   spanPrefix: 'example.PostRepository',
 * });
 * ```
 *
 * @example
 * ```ts
 * import { PostRepository } from './post-repository.js';
 *
 * const post = yield* PostRepository.getById('123');
 * ```
 *
 * @example
 * ```ts
 * import { PostRepository } from './post-repository.js';
 *
 * const posts = yield* PostRepository.query(Query.orderBy('createdAt', 'desc'));
 * ```
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
): Effect.Effect<Repository<S, Id, IdSchema>, never, FirestoreService> =>
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

    // Create schema for update: required id + partial data fields (all optional)
    const PartialDataSchema = (
      Model.update as Schema.Struct<Schema.Struct.Fields>
    ).pipe(Schema.omit(options.idField as string), Schema.partial);

    const updateFieldsSchema = Schema.extend(
      Schema.Struct({ [options.idField]: idSchema }),
      PartialDataSchema
    );

    const updateSchema = Fetch.void({
      Request: updateFieldsSchema,
      execute: ({ [options.idField]: id, ...data }) =>
        firestore.update(`${options.collectionPath}/${id}`, data),
    });

    const update = (
      id: Schema.Schema.Type<IdSchema>,
      data: Partial<Omit<S['update']['Type'], Id>>
    ): Effect.Effect<void, ModelError, S['Context'] | S['update']['Context']> =>
      updateSchema({
        [options.idField]: id,
        ...data,
      }).pipe(
        Effect.withSpan(`${options.spanPrefix}.update`, {
          captureStackTrace: false,
          attributes: { id, data },
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
      constraints: RepositoryQuery<S>
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
      constraints: RepositoryQuery<S>
    ): Stream.Stream<ReadonlyArray<S['Type']>, ModelError, S['Context']> =>
      queryStreamSchema(constraints as ReadonlyArray<unknown>).pipe(
        Stream.tap(() => Effect.logTrace(`${options.spanPrefix}.streamQuery`))
      );

    return {
      add,
      update,
      getById,
      getByIdStream,
      delete: deleteById,
      query,
      queryStream,
    };
  });
